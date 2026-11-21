import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { BackdropGlass } from '../glass/rendering/backdropGlass.js';
import { reportFrameLoopError } from '../glass/logger.js';
import { ensureGlassAllocated, setClipIfChanged, isActorValid, placeScreenGlass, GLASS_SHADOW_MAX_RADIUS } from '../glass/actors.js';
import { isFrameSyncFrozen, SAME_FRAME_WINDOW_US, startStageLoop, stopStageLoop, hexToColorArray } from '../glass/animation.js';
export const SHADER_PADDING = 20;
const DOCK_MATERIAL = [
    ['dock-tint-color', (g, s) => g.setTintColor(...hexToColorArray(s.get_string('dock-tint-color')))],
    ['dock-tint-strength', (g, s) => g.setTintStrength(s.get_double('dock-tint-strength'))],
    ['dock-blur-radius', (g, s) => g.setBlurRadius(s.get_int('dock-blur-radius'))],
    ['dock-corner-radius', (g, s) => g.setCornerRadius(s.get_double('dock-corner-radius'))],
    ['dock-brightness', (g, s) => g.setBrightness(s.get_double('dock-brightness'))],
    ['dock-contrast', (g, s) => g.setContrast(s.get_double('dock-contrast'))],
    ['dock-saturation', (g, s) => g.setSaturation(s.get_double('dock-saturation'))],
];

export function createDockGlass(extensionPath, settings, logger, owner) {
    const glass = new BackdropGlass({ extensionPath, settings, logger, owner, outline: 'dock' });
    glass.setPadding(SHADER_PADDING);
    for (const [, apply] of DOCK_MATERIAL)
        apply(glass, settings);
    glass.setIsDock(true);
    return glass;
}

export function followDockMaterial(settings, glass) {
    return DOCK_MATERIAL.map(([key, apply]) => settings.connect(`changed::${key}`, () => {
        const current = glass();
        if (current) {
            apply(current, settings);
            current.queue_redraw();
        }
    }));
}

export class DashManager {
    extensionPath;
    targetActor;
    _settings;
    glass = null;
    _lastScreenW;
    _lastScreenH;
    _glassExpand;
    _signals;
    _settingsSignals;
    _frameSyncId;
    _frameSignalId = 0;
    _lastTickUs = 0;
    _isEffectActive;
    _originalStyle;
    _currentMarginStyle;
    _dockParent = null;
    _lastAbsX;
    _lastAbsY;
    _lastTW;
    _lastTH;
    _stableDeltaW;
    _stableDeltaH;
    _lastBgW;
    _lastBgH;
    _lastBgX;
    _lastBgY;
    _lastBaseW;
    _lastBaseH;
    _marginValue = 0;
    _lastHidden;
    _liveRef = null;
    _logger;
    _isFluidDock = null;
    _bgChild = null;
    _dashChild = null;
    _refActor = undefined;
    _cachedMonitorIdx = -1;
    _monitorsChangedId = 0;
    _lastEffOpacity = -1;

    constructor(extensionPath, targetActor, settings, logger) {
        this.extensionPath = extensionPath;
        this.targetActor = targetActor;
        this._settings = settings;
        this._logger = logger;
        this._glassExpand = 0;
        this._signals = [];
        this._settingsSignals = [];
        this._frameSyncId = 0;
        this._isEffectActive = false;
    }

    setup() {
        if (!this.targetActor || !this._settings)
            return;
        this._bindSettings();
        if (this._settings.get_boolean('enable-dock-glass')) {
            this._applyEffect();
        }
    }

    _bindSettings() {
        const connectSetting = (key, callback) => {
            let id = this._settings.connect(`changed::${key}`, callback.bind(this));
            this._settingsSignals.push(id);
        };
        connectSetting('enable-dock-glass', () => {
            let enabled = this._settings.get_boolean('enable-dock-glass');
            if (enabled && !this._isEffectActive) {
                this._applyEffect();
            }
            else if (!enabled && this._isEffectActive) {
                this._removeEffect();
            }
        });
        connectSetting('dock-glass-expand', () => {
            if (this.glass && this._isEffectActive) {
                this._glassExpand = this._settings.get_int('dock-glass-expand');
                this.glass?.queue_redraw();
            }
        });
        connectSetting('dock-margin-bottom', () => {
            if (this._isEffectActive)
                this._applyMargin();
            this._marginValue = this._settings.get_int('dock-margin-bottom') || 0;
        });
        this._settingsSignals.push(...followDockMaterial(this._settings, () => this.glass));
    }

    _isDock() {
        if (!this.targetActor)
            return false;
        if (this._isFluidDock !== null)
            return this._isFluidDock;
        this._isFluidDock = this.targetActor.get_children().some(c => {
            const name = c.get_name?.() ?? '';
            return name === 'fluidGlassDockBackground' || name === 'DockBackground';
        });
        return this._isFluidDock;
    }

    _getBgChild() {
        if (this._bgChild && isActorValid(this._bgChild) && this._bgChild.get_parent() === this.targetActor)
            return this._bgChild;
        this._bgChild = null;
        if (!this.targetActor)
            return null;
        const children = this.targetActor.get_children();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childName = child.get_name?.() ?? '';
            if (child.has_style_class_name('dash-background') ||
                childName === 'fluidGlassDockBackground' ||
                childName === 'DockBackground') {
                this._bgChild = child;
                return child;
            }
        }
        return null;
    }

    _getEffectiveOpacity() {
        let op = this.targetActor.opacity;
        if (op <= 0) {
            if (!this._dashChild || !isActorValid(this._dashChild) || this._dashChild.get_parent() !== this.targetActor)
                this._dashChild = this.targetActor.get_children?.().find(c => c.get_name?.() === 'dash') ?? null;
            if (this._dashChild && this._dashChild.opacity > 0)
                op = this._dashChild.opacity;
            else if (this.targetActor.visible)
                op = 255;
        }
        return op;
    }

    _applyMargin() {
        if (!this.targetActor || this._isDock())
            return;
        let marginBottom = this._settings.get_int('dock-margin-bottom');
        let [w, h] = this.targetActor.get_size();
        let [x, y] = this.targetActor.get_transformed_position();
        let monitorIndex = Main.layoutManager.findIndexForActor(this.targetActor);
        if (monitorIndex < 0)
            monitorIndex = Main.layoutManager.primaryIndex;
        let monitor = Main.layoutManager.monitors[monitorIndex] || Main.layoutManager.primaryMonitor;
        let distLeft = x - monitor.x;
        let distRight = (monitor.x + monitor.width) - (x + w);
        let distTop = y - monitor.y;
        let distBottom = (monitor.y + monitor.height) - (y + h);
        let minEdge = Math.min(distLeft, distRight, distTop, distBottom);
        let marginStyle = '';
        if (minEdge === distBottom || minEdge === distTop) {
            if (minEdge === distBottom)
                marginStyle = `margin-bottom: ${marginBottom}px;`;
            else
                marginStyle = `margin-top: ${marginBottom}px;`;
        }
        else {
            if (minEdge === distRight)
                marginStyle = `margin-right: ${marginBottom}px;`;
            else
                marginStyle = `margin-left: ${marginBottom}px;`;
        }
        if (this._originalStyle === undefined) {
            this._originalStyle = this.targetActor.get_style() || '';
        }
        this._currentMarginStyle = marginStyle;
        this.targetActor.set_style(`${this._originalStyle} ${marginStyle}`);
    }

    _applyEffect() {
        if (this._isEffectActive)
            return;
        this._isEffectActive = true;
        this._lastScreenW = this._lastScreenH = undefined;
        this._lastBgW = this._lastBgH = undefined;
        this._lastBgX = this._lastBgY = undefined;
        this._lastBaseW = this._lastBaseH = undefined;
        this._lastAbsX = this._lastAbsY = undefined;
        this._lastTW = this._lastTH = undefined;
        this._stableDeltaW = this._stableDeltaH = undefined;
        this._lastHidden = undefined;
        this._isFluidDock = null;
        this._bgChild = null;
        this._dashChild = null;
        this._refActor = undefined;
        this._cachedMonitorIdx = -1;
        this._lastEffOpacity = -1;
        this.targetActor.add_style_class_name('fluid-glass-transparent');
        this._dockParent = this.targetActor.get_parent();
        if (this._dockParent) {
            this._dockParent.add_style_class_name('fluid-glass-transparent');
        }
        const glass = createDockGlass(this.extensionPath, this._settings, this._logger, 'dock');
        this.glass = glass;
        glass.set_size(1.0, 1.0);
        this._applyMargin();
        this._marginValue = this._settings.get_int('dock-margin-bottom');
        this._glassExpand = this._settings.get_int("dock-glass-expand");
        let dockRoot = this.targetActor;
        while (dockRoot && dockRoot.get_parent() !== Main.layoutManager.uiGroup) {
            let p = dockRoot.get_parent();
            if (!p)
                break;
            dockRoot = p;
        }
        if (dockRoot && dockRoot.get_parent() === Main.layoutManager.uiGroup) {
            Main.layoutManager.uiGroup.insert_child_below(glass, dockRoot);
        }
        else {
            Main.layoutManager.uiGroup.add_child(glass);
        }
        glass.setLiveGeometryHook(() => this._syncGlassGeometryLive());
        glass.show();
        let frameTick = () => {
            if (!this._isEffectActive || !this.glass || !this.targetActor.mapped)
                return;
            if (isFrameSyncFrozen())
                return;
            const nowUs = GLib.get_monotonic_time();
            if (nowUs - this._lastTickUs < SAME_FRAME_WINDOW_US)
                return;
            this._lastTickUs = nowUs;
            try {
                ensureGlassAllocated(this.glass);
                this._syncGeometry();
            }
            catch (e) {
                reportFrameLoopError('DockManager', e);
            }
        };
        let startFrameSync = () => {
            if (this._frameSignalId !== 0)
                return;
            startStageLoop(this._frameSignalSlot, this._frameSlot, frameTick);
        };
        let mapSignalId = this.targetActor.connect('notify::mapped', () => {
            if (this.targetActor.mapped) {
                startFrameSync();
            }
            else {
                this._stopFrameSync();
                this._hideGlass();
            }
        });
        let childAddedId = this.targetActor.connect('child-added', () => {
            this._isFluidDock = null;
            this._bgChild = null;
            this._dashChild = null;
            this._refActor = undefined;
        });
        let childRemovedId = this.targetActor.connect('child-removed', () => {
            this._isFluidDock = null;
            this._bgChild = null;
            this._dashChild = null;
            this._refActor = undefined;
        });
        this._signals.push(mapSignalId, childAddedId, childRemovedId);
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._cachedMonitorIdx = -1;
        });
        if (this.targetActor.mapped) {
            startFrameSync();
        }
    }

    _syncGlassGeometryLive() {
        const ref = this._liveRef;
        if (!ref || !this.glass)
            return;
        if (!ref.actor?.mapped)
            return;
        const [nx, ny] = ref.actor.get_transformed_position();
        if (!Number.isFinite(nx) || !Number.isFinite(ny))
            return;
        this.glass.setGlassGeometry(ref.rect[0] + (nx - ref.rawX), ref.rect[1] + (ny - ref.rawY), ref.rect[2], ref.rect[3]);
    }

    _resolveMonitor() {
        const monitors = Main.layoutManager.monitors;
        if (monitors.length <= 1)
            return Main.layoutManager.primaryMonitor;
        if (this._cachedMonitorIdx < 0 || !monitors[this._cachedMonitorIdx]) {
            let idx = Main.layoutManager.findIndexForActor(this.targetActor);
            if (idx < 0)
                idx = Main.layoutManager.primaryIndex;
            this._cachedMonitorIdx = idx;
        }
        return monitors[this._cachedMonitorIdx] || Main.layoutManager.primaryMonitor;
    }

    _syncGeometry() {
        if (!this.glass || !this.targetActor || !this.targetActor.mapped)
            return;
        let bounds = this._readDockBounds();
        if (!bounds)
            return;
        const monitor = this._resolveMonitor();
        const isFluid = this._isDock();
        if (!isFluid) {
            const edges = dockEdges(bounds, monitor);
            bounds = this._stabilizeDockBounds(bounds, edges);
            if (this._refActor === undefined || (this._refActor && !isActorValid(this._refActor)))
                this._refActor = this._findReferenceActor(this.targetActor);
            if (this._refActor)
                bounds = balanceDockBounds(bounds, this._actorBounds(this._refActor), edges);
            bounds = this._applyDockMargin(bounds, monitor, edges);
        }
        const { absX, absY, baseW, baseH } = bounds;
        if (baseW <= 9 || baseH <= 9) {
            this._hideGlass();
            return;
        }
        const [visibleW, visibleH] = visibleDockSize(bounds, monitor);
        const effOpacity = this._getEffectiveOpacity();
        if (visibleW <= 1 || visibleH <= 1 || effOpacity <= 0) {
            if (this._lastHidden !== true) {
                this._lastHidden = true;
                this._logger.log(`[Liquid Glass][dock] hiding the glass: visible=(${visibleW.toFixed(1)}x${visibleH.toFixed(1)}) ` +
                    `base=(${baseW.toFixed(1)}x${baseH.toFixed(1)}) abs=(${absX.toFixed(1)},${absY.toFixed(1)}) ` +
                    `monitor=(${monitor?.x},${monitor?.y},${monitor?.width}x${monitor?.height}) ` +
                    `margin=${this._marginValue}`);
            }
            if (this.glass.visible)
                this._hideGlass();
            return;
        }
        if (this._lastHidden === true) {
            this._lastHidden = false;
            this._logger.log('[Liquid Glass][dock] glass visible again');
        }
        if (!this.glass.visible)
            this.glass.show();
        if (effOpacity !== this._lastEffOpacity) {
            this.glass.opacity = effOpacity;
            this._lastEffOpacity = effOpacity;
        }
        this._syncDockGlass(bounds, monitor);
    }

    _actorBounds(actor) {
        const [baseW, baseH] = actor.get_size();
        const [absX, absY] = actor.get_transformed_position();
        return { absX, absY, baseW, baseH };
    }

    _liveSource = null;

    _readDockBounds() {
        const bgChild = this._getBgChild();
        let sourceActor = this.targetActor;
        if (bgChild) {
            if (bgChild.opacity !== 0)
                bgChild.opacity = 0;
            sourceActor = bgChild;
        }
        let [baseW, baseH] = sourceActor.get_size();
        let [absX, absY] = sourceActor.get_transformed_position();
        if (Number.isNaN(absX) || Number.isNaN(absY))
            return null;
        this._liveSource = { actor: sourceActor, rawX: absX, rawY: absY };
        const bounds = { absX, absY, baseW, baseH };
        if (sourceActor !== this.targetActor && this._isDock()) {
            return bounds;
        }
        return sourceActor === this.targetActor ? bounds : clipDockBounds(bounds, this._actorBounds(this.targetActor));
    }

    _stabilizeDockBounds(bounds, edges) {
        let { baseW, baseH } = bounds;
        const { minCenterDist, distTopCenter, distBottomCenter } = edges;
        if (this._lastBaseW !== undefined && this._lastBaseH !== undefined) {
            let isHorizontalDock = (minCenterDist === distTopCenter || minCenterDist === distBottomCenter);
            if (isHorizontalDock) {
                if (Math.abs(Math.abs(baseH - this._lastBaseH) - this._marginValue) <= 1)
                    baseH = this._lastBaseH;
            }
            else {
                if (Math.abs(Math.abs(baseW - this._lastBaseW) - this._marginValue) <= 1)
                    baseW = this._lastBaseW;
            }
        }
        this._lastBaseW = baseW;
        this._lastBaseH = baseH;
        return { ...bounds, baseW, baseH };
    }

    _applyDockMargin(bounds, monitor, edges) {
        if (this._isDock())
            return bounds;
        const marginValue = this._marginValue || 0;
        if (!monitor || !(marginValue > 0))
            return bounds;
        const { absX, absY, baseW, baseH } = bounds;
        let isMoving = false;
        if (this._lastAbsX !== undefined && this._lastAbsY !== undefined) {
            const horizontal = edges.minCenterDist === edges.distTopCenter || edges.minCenterDist === edges.distBottomCenter;
            isMoving = horizontal ? Math.abs(absY - this._lastAbsY) > 1.0 : Math.abs(absX - this._lastAbsX) > 1.0;
        }
        this._lastAbsX = absX;
        this._lastAbsY = absY;
        let [tW, tH] = this.targetActor.get_size();
        if (this._stableDeltaW === undefined || this._lastTW !== tW) {
            this._stableDeltaW = baseW - tW;
            this._lastTW = tW;
        }
        if (this._stableDeltaH === undefined || this._lastTH !== tH) {
            this._stableDeltaH = baseH - tH;
            this._lastTH = tH;
        }
        let stableBaseW = tW + this._stableDeltaW;
        let stableBaseH = tH + this._stableDeltaH;
        return isMoving ? bounds : insetDockBounds(bounds, monitor, edges, marginValue, stableBaseW, stableBaseH);
    }

    _syncDockVisibility(bounds, monitor) {
        const { absX, absY, baseW, baseH } = bounds;
        const [visibleW, visibleH] = visibleDockSize(bounds, monitor);
        if (visibleW <= 1 || visibleH <= 1) {
            if (this._lastHidden !== true) {
                this._lastHidden = true;
                this._logger.log(`[Liquid Glass][dock] hiding the glass: visible=(${visibleW.toFixed(1)}x${visibleH.toFixed(1)}) ` +
                    `base=(${baseW.toFixed(1)}x${baseH.toFixed(1)}) abs=(${absX.toFixed(1)},${absY.toFixed(1)}) ` +
                    `monitor=(${monitor?.x},${monitor?.y},${monitor?.width}x${monitor?.height}) ` +
                    `margin=${this._marginValue}`);
            }
            this.glass.opacity = 0;
        }
        else {
            if (this._lastHidden === true) {
                this._lastHidden = false;
                this._logger.log('[Liquid Glass][dock] glass visible again');
            }
            this.glass.opacity = this._getEffectiveOpacity();
        }
    }

    _syncDockGlass(bounds, monitor) {
        const { absX, absY, baseW, baseH } = bounds;
        const w = Math.max(1.0, baseW), h = Math.max(1.0, baseH);
        let bgW = Math.max(1.0, w + (SHADER_PADDING * 2) + (this._glassExpand * 2));
        let bgH = Math.max(1.0, h + (SHADER_PADDING * 2) + (this._glassExpand * 2));
        let bgX = absX - SHADER_PADDING - this._glassExpand;
        let bgY = absY - SHADER_PADDING - this._glassExpand;
        let screenW = monitor.width;
        let screenH = monitor.height;
        let localBgX = bgX - monitor.x;
        let localBgY = bgY - monitor.y;
        const boundsChanged = this._lastBgW !== bgW || this._lastBgH !== bgH ||
            this._lastBgX !== bgX || this._lastBgY !== bgY ||
            this._lastScreenW !== screenW || this._lastScreenH !== screenH ||
            this.glass.x !== monitor.x || this.glass.y !== monitor.y;
        if (boundsChanged) {
            if (this.glass.get_transition('size'))
                this.glass.remove_transition('size');
            if (this.glass.get_transition('position'))
                this.glass.remove_transition('position');
            this.glass.set_position(monitor.x, monitor.y);
            this.glass.set_size(screenW, screenH);
            if (this.glass.get_transition('size'))
                this.glass.remove_transition('size');
            if (this.glass.get_transition('position'))
                this.glass.remove_transition('position');
            const CLIP_PADDING = 200;
            setClipIfChanged(this.glass, localBgX - CLIP_PADDING, localBgY - CLIP_PADDING, bgW + CLIP_PADDING * 2, bgH + CLIP_PADDING * 2);
            const SHADOW_MAX_RADIUS = CLIP_PADDING - 20;
            this.glass?.setShadowMaxRadius(SHADOW_MAX_RADIUS);
            this.glass?.setResolution(screenW, screenH);
            this.glass?.setGlassGeometry(localBgX, localBgY, bgW, bgH);
            const source = this._liveSource;
            this._liveRef = source ? {
                actor: source.actor,
                rawX: source.rawX, rawY: source.rawY,
                rect: [localBgX, localBgY, bgW, bgH],
            } : null;
            this._lastBgW = bgW;
            this._lastBgH = bgH;
            this._lastBgX = bgX;
            this._lastBgY = bgY;
            this._lastScreenW = screenW;
            this._lastScreenH = screenH;
        }
        this.glass.syncSources(boundsChanged);
    }

    get _frameSlot() {
        return { get: () => this._frameSyncId, set: (id) => { this._frameSyncId = id; } };
    }

    get _frameSignalSlot() {
        return { get: () => this._frameSignalId, set: (id) => { this._frameSignalId = id; } };
    }

    _hideGlass() {
        this.glass?.hide();
        this._lastBgW = undefined;
        this._lastBgH = undefined;
        this._lastBgX = undefined;
        this._lastBgY = undefined;
        this._lastEffOpacity = -1;
    }

    resetCachedBounds() {
        this._lastScreenW = undefined;
        this._lastScreenH = undefined;
        this._lastBgW = undefined;
        this._lastBgH = undefined;
        this._lastBgX = undefined;
        this._lastBgY = undefined;
        this._lastBaseW = undefined;
        this._lastBaseH = undefined;
        this._lastAbsX = undefined;
        this._lastAbsY = undefined;
        this._lastTW = undefined;
        this._lastTH = undefined;
        this._stableDeltaW = undefined;
        this._stableDeltaH = undefined;
        this._liveRef = null;
        this._liveSource = null;
        this._isFluidDock = null;
        this._bgChild = null;
        this._dashChild = null;
        this._refActor = undefined;
        this._cachedMonitorIdx = -1;
        this._lastEffOpacity = -1;
    }

    _stopFrameSync() {
        stopStageLoop(this._frameSignalSlot, this._frameSlot);
    }

    _removeEffect() {
        if (!this._isEffectActive)
            return;
        this._isEffectActive = false;
        this._currentMarginStyle = undefined;
        this._stopFrameSync();
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        this._isFluidDock = null;
        this._bgChild = null;
        this._dashChild = null;
        this._refActor = undefined;
        this._cachedMonitorIdx = -1;
        this._lastEffOpacity = -1;
        const dockAlive = isActorValid(this.targetActor);
        for (const id of this._signals) {
            if (dockAlive)
                this.targetActor.disconnect(id);
        }
        this._signals = [];
        if (dockAlive) {
            this.targetActor.remove_style_class_name('fluid-glass-transparent');
            if (this._originalStyle !== undefined)
                this.targetActor.set_style(this._originalStyle);
            for (const child of this.targetActor.get_children()) {
                const name = child.get_name?.() ?? '';
                if (child.has_style_class_name('dash-background') || name === 'fluidGlassDockBackground' || name === 'DockBackground')
                    child.opacity = 255;
            }
        }
        this._originalStyle = undefined;
        if (isActorValid(this._dockParent))
            this._dockParent.remove_style_class_name('fluid-glass-transparent');
        this._dockParent = null;
        const glass = this.glass;
        this.glass = null;
        if (glass) {
            glass.cleanup();
            if (isActorValid(glass))
                glass.destroy();
        }
    }

    cleanup() {
        this._liveRef = null;
        this._stopFrameSync();
        this._removeEffect();
        for (let id of this._settingsSignals)
            this._settings.disconnect(id);
        this._settingsSignals = [];
    }

    _findReferenceActor(actor) {
        if (!actor)
            return null;
        if (actor.toString().includes('IndicatorDrawingArea'))
            return actor;
        for (const child of actor.get_children()) {
            const found = this._findReferenceActor(child);
            if (found)
                return found;
        }
        return null;
    }
}

export function clipDockBounds(bounds, target) {
    let { absX, absY, baseW, baseH } = bounds;
    const { absX: tX, absY: tY, baseW: tW, baseH: tH } = target;
    if (absX < tX) {
        baseW -= (tX - absX);
        absX = tX;
    }
    if (absY < tY) {
        baseH -= (tY - absY);
        absY = tY;
    }
    if (absX + baseW > tX + tW)
        baseW = (tX + tW) - absX;
    if (absY + baseH > tY + tH)
        baseH = (tY + tH) - absY;
    return { absX, absY, baseW, baseH };
}

export function dockEdges(bounds, monitor) {
    let minCenterDist = -1;
    let distLeftCenter = 0, distRightCenter = 0, distTopCenter = 0, distBottomCenter = 0;
    if (monitor) {
        const dockCenterX = bounds.absX + bounds.baseW / 2;
        const dockCenterY = bounds.absY + bounds.baseH / 2;
        distLeftCenter = dockCenterX - monitor.x;
        distRightCenter = monitor.x + monitor.width - dockCenterX;
        distTopCenter = dockCenterY - monitor.y;
        distBottomCenter = monitor.y + monitor.height - dockCenterY;
        minCenterDist = Math.min(distLeftCenter, distRightCenter, distTopCenter, distBottomCenter);
    }
    return { minCenterDist, distLeftCenter, distRightCenter, distTopCenter, distBottomCenter };
}

function referenceGaps(start, size, refStart, refSize) {
    let before = refStart - start;
    let after = start + size - (refStart + refSize);
    if (before < 0 || after < 0) {
        const trueStart = refStart - refSize;
        before = trueStart - start;
        after = start + size - (trueStart + refSize);
    }
    return [before, after];
}

export function balanceDockBounds(bounds, reference, edges) {
    let { absX, absY, baseW, baseH } = bounds;
    const { absX: refX, absY: refY, baseW: refW, baseH: refH } = reference;
    if (Number.isNaN(refX) || Number.isNaN(refY) || !(refW > 0) || !(refH > 0))
        return bounds;
    const [topGap, bottomGap] = referenceGaps(absY, baseH, refY, refH);
    const [leftGap, rightGap] = referenceGaps(absX, baseW, refX, refW);
    if (baseW >= baseH) {
        const diff = Math.abs(bottomGap - topGap);
        if (diff > 0 && diff < baseH / 2) {
            if (!(bottomGap > topGap))
                absY += diff;
            baseH -= diff;
        }
    }
    else {
        const diff = Math.abs(rightGap - leftGap);
        if (diff > 0 && diff < baseW / 2 &&
            (edges.minCenterDist !== edges.distLeftCenter || rightGap > leftGap)) {
            if (!(rightGap > leftGap))
                absX += diff;
            baseW -= diff;
        }
    }
    return { absX, absY, baseW, baseH };
}

export function insetDockBounds(bounds, monitor, edges, margin, stableBaseW, stableBaseH) {
    let { absX, absY, baseW, baseH } = bounds;
    const { minCenterDist, distBottomCenter, distTopCenter, distRightCenter } = edges;
    if (minCenterDist === distBottomCenter) {
        [absY, baseH] = insetSpan(absY, baseH, monitor.y + monitor.height - margin, stableBaseH, false);
    }
    else if (minCenterDist === distTopCenter) {
        [absY, baseH] = insetSpan(absY, baseH, monitor.y + margin, stableBaseH, true);
    }
    else if (minCenterDist === distRightCenter) {
        [absX, baseW] = insetSpan(absX, baseW, monitor.x + monitor.width - margin, stableBaseW, false);
    }
    else {
        [absX, baseW] = insetSpan(absX, baseW, monitor.x + margin, stableBaseW, true);
    }
    return { absX, absY, baseW, baseH };
}

function insetSpan(start, size, edge, stableSize, leading) {
    if (leading) {
        if (start < edge) {
            size -= edge - start;
            start = edge;
        }
    }
    else if (start + size > edge) {
        size -= (start + size) - edge;
    }
    if (size < 0)
        size = 0;
    if (size > stableSize)
        size = stableSize;
    return [start, size];
}

export function visibleDockSize(bounds, monitor) {
    const { absX, absY, baseW, baseH } = bounds;
    let visibleW = baseW, visibleH = baseH;
    if (monitor) {
        if (absX < monitor.x)
            visibleW -= monitor.x - absX;
        if (absY < monitor.y)
            visibleH -= monitor.y - absY;
        if (absX + baseW > monitor.x + monitor.width)
            visibleW -= (absX + baseW) - (monitor.x + monitor.width);
        if (absY + baseH > monitor.y + monitor.height)
            visibleH -= (absY + baseH) - (monitor.y + monitor.height);
    }
    return [visibleW, visibleH];
}

export { DashManager as DockGlass };
