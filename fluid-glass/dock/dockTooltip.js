import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { attachGlass, SHADER_PADDING } from '../glass/glassEffect.js';
import { AdaptiveClassContrast } from '../glass/contrastSampler.js';
import { isActorValid } from '../glass/actors.js';

const POINTER_DEPTH_PX = 9;
const POINTER_GAP_PX = 6;
const SCREEN_MARGIN_PX = 8;
const SHOW_FADE_MS = 110;
const HIDE_FADE_MS = 90;

const POINTER_CONFIG = {
    bottom: { side: 1.0, cls: 'fluid-glass-dock-tooltip-bottom' },
    top:    { side: 2.0, cls: 'fluid-glass-dock-tooltip-top' },
    left:   { side: 3.0, cls: 'fluid-glass-dock-tooltip-left' },
    right:  { side: 4.0, cls: 'fluid-glass-dock-tooltip-right' },
};

export const DockTooltip = GObject.registerClass(
    {
        GTypeName: 'FluidGlass_Dock_DockTooltip',
    },
    class DockTooltip extends St.Widget {
        _init(dock, glassSettings, logger) {
            super._init({
                name: 'FluidGlassDockTooltip',
                style_class: 'fluid-glass-dock-tooltip',
                layout_manager: new Clutter.BinLayout(),
                reactive: false,
                can_focus: false,
                visible: false,
                opacity: 0,
            });

            this._dock = dock;
            this._settings = glassSettings;
            this._logger = logger;
            this._shown = false;
            this._destroyed = false;
            this._positionClass = null;
            this._pointerSide = 1.0;
            this._pointerSize = POINTER_DEPTH_PX;
            this._pointerOffset = 0.0;
            this._boxX = 0;
            this._boxY = 0;
            this._boxW = 0;
            this._boxH = 0;

            this._label = new St.Label({
                style_class: 'fluid-glass-dock-tooltip-label',
                text: '',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._label);

            Main.layoutManager.uiGroup.add_child(this);

            this._glassHandle = attachGlass(this, {
                extensionPath: dock?.extension?.getExtensionPath?.() ?? '',
                settings: glassSettings,
                logger,
                owner: 'dockTooltip',
                cornerRadius: 999,
                blurRadius: 14,
                tintColor: '#f5f7fb',
                tintStrength: 0.34,
                brightness: 1.08,
                contrast: 0.98,
                saturation: 1.25,
                padding: SHADER_PADDING,
                outlineWidth: 0.7,
                outlineColor: '#ffffff',
                tooltipPointerSide: this._pointerSide,
                tooltipPointerSize: this._pointerSize,
                tooltipPointerOffset: this._pointerOffset,
                onSync: (handle) => {
                    handle.glass?.setTooltipPointer?.(
                        this._pointerSide,
                        this._pointerSize,
                        this._pointerOffset
                    );
                },
            });

            this._adaptive = new AdaptiveClassContrast({
                label: 'dockTooltip',
                logger,
                perElement: false,
                intervalMs: 220,
                lightClass: 'fluid-glass-dock-tooltip-light',
                darkClass: 'fluid-glass-dock-tooltip-dark',
                getTargets: () => (isActorValid(this) ? [this] : []),
                getGlasses: () => (
                    this._glassHandle?.glass && isActorValid(this._glassHandle.glass)
                        ? [this._glassHandle.glass]
                        : []
                ),
                getEnabled: () => {
                    try {
                        return this._settings?.get_boolean('menu-enable-adaptive-text-color') ?? true;
                    } catch (_e) {
                        return true;
                    }
                },
                getPreference: () => {
                    try {
                        return this._settings?.get_string('menu-adaptive-text-preference') ?? 'auto';
                    } catch (_e) {
                        return 'auto';
                    }
                },
                fallbackIsDark: () => true,
                getInitialRect: () => this._currentRect(),
            });
        }

        get isActive() {
            return this._shown;
        }

        _currentRect() {
            if (!this._shown || this._boxW <= 0 || this._boxH <= 0)
                return null;
            return {
                x: this._boxX,
                y: this._boxY,
                width: this._boxW,
                height: this._boxH,
            };
        }

        _applyPositionClass(cls) {
            if (this._positionClass === cls)
                return false;
            if (this._positionClass)
                this.remove_style_class_name(this._positionClass);
            this.add_style_class_name(cls);
            this._positionClass = cls;
            return true;
        }

        _raiseAboveDock() {
            const parent = this.get_parent();
            if (!parent)
                return;
            parent.set_child_above_sibling(this, null);
            const glass = this._glassHandle?.glass;
            if (glass && isActorValid(glass) && glass.get_parent() === parent)
                parent.set_child_below_sibling(glass, this);
        }

        showTooltip(text, iconRect, position, monitor, dockRect = null) {
            if (this._destroyed || !text || !iconRect || !monitor)
                return;

            const cfg = POINTER_CONFIG[position] ?? POINTER_CONFIG.bottom;
            const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
            const sideChanged = this._applyPositionClass(cfg.cls);
            const textChanged = this._label.text !== text;

            if (textChanged)
                this._label.text = text;

            if (sideChanged || textChanged || this._boxW <= 0 || this._boxH <= 0) {
                this.set_size(-1, -1);
                this.ensure_style();
                this._label.ensure_style();
                const [, prefW] = this.get_preferred_width(-1);
                const [, prefH] = this.get_preferred_height(prefW);
                this._boxW = Math.max(1, Math.ceil(prefW));
                this._boxH = Math.max(1, Math.ceil(prefH));
                this.set_size(this._boxW, this._boxH);
            }

            const w = this._boxW;
            const h = this._boxH;
            const gap = POINTER_GAP_PX * scaleFactor;
            const margin = SCREEN_MARGIN_PX * scaleFactor;
            const [ix, iy, iw, ih] = iconRect;
            const icx = ix + iw * 0.5;
            const icy = iy + ih * 0.5;

            let x;
            let y;
            if (cfg.side === 1.0) {
                const anchor = dockRect ? Math.min(iy, dockRect[1]) : iy;
                x = icx - w * 0.5;
                y = anchor - gap - h;
            } else if (cfg.side === 2.0) {
                const anchor = dockRect ? Math.max(iy + ih, dockRect[1] + dockRect[3]) : (iy + ih);
                x = icx - w * 0.5;
                y = anchor + gap;
            } else if (cfg.side === 3.0) {
                const anchor = dockRect ? Math.max(ix + iw, dockRect[0] + dockRect[2]) : (ix + iw);
                x = anchor + gap;
                y = icy - h * 0.5;
            } else {
                const anchor = dockRect ? Math.min(ix, dockRect[0]) : ix;
                x = anchor - gap - w;
                y = icy - h * 0.5;
            }

            const minX = monitor.x + margin;
            const maxX = Math.max(minX, monitor.x + monitor.width - margin - w);
            const minY = monitor.y + margin;
            const maxY = Math.max(minY, monitor.y + monitor.height - margin - h);
            x = Math.round(Math.min(maxX, Math.max(minX, x)));
            y = Math.round(Math.min(maxY, Math.max(minY, y)));

            const prevX = this._boxX;
            const prevY = this._boxY;
            this._boxX = x;
            this._boxY = y;
            this.set_position(x, y);

            this._pointerSide = cfg.side;
            this._pointerSize = POINTER_DEPTH_PX * scaleFactor;
            this._pointerOffset = cfg.side <= 2.5
                ? icx - (x + w * 0.5)
                : icy - (y + h * 0.5);

            this._glassHandle?.glass?.setTooltipPointer?.(
                this._pointerSide,
                this._pointerSize,
                this._pointerOffset
            );

            const movedFar = Math.abs(x - prevX) > 24 || Math.abs(y - prevY) > 24;
            if (!this._shown) {
                this._shown = true;
                this._raiseAboveDock();
                this.show();
                this._glassHandle?.show?.();
                this.remove_all_transitions();
                this.ease({
                    opacity: 255,
                    duration: SHOW_FADE_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                this._adaptive?.start(true);
            } else if (textChanged || movedFar) {
                this._adaptive?.invalidate();
                this._adaptive?.update();
            }
        }

        hideTooltip() {
            if (!this._shown || this._destroyed)
                return;
            this._shown = false;
            this._adaptive?.stop(false);
            this.remove_all_transitions();
            this.ease({
                opacity: 0,
                duration: HIDE_FADE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (!this._shown && !this._destroyed && isActorValid(this)) {
                        this.hide();
                        this._glassHandle?.hide?.();
                    }
                },
            });
        }

        destroy() {
            if (this._destroyed)
                return;
            this._destroyed = true;
            this._shown = false;
            try { this.remove_all_transitions(); } catch (_e) {}
            this._adaptive?.destroy();
            this._adaptive = null;
            this._glassHandle?.destroy();
            this._glassHandle = null;
            super.destroy();
        }
    }
);
