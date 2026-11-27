import Cogl from 'gi://Cogl';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getTransformedRect, isActorValid } from './actors.js';
import { utilsLog } from './logger.js';
import { createTarget } from './rendering/backdropGlass.js';
import { coglContext, paintStageToContent } from './shellVersion.js';
import { adaptiveColorTweener, hexToRgb, resolveCrossFade } from './animation.js';

const DARK_BG_MAX_LUMA = 0.13;
const LIGHT_BG_MIN_LUMA = 0.38;
const LUMA_HYSTERESIS = 0.03;
const BACKDROP_COVERS_GLASS_ALPHA = 190;
const BACKDROP_SEARCH_DEPTH = 8;
const SAMPLE_MAX_EDGE = 12;
const SAMPLE_MAX_EDGE_MERGED = 28;
const COLOR_TWEEN_MS = 320;

export const AdaptiveContrastConfig = {
    enabled: true,
    samplePerElement: false,
    sampleIntervalMs: 200,
    lightTextColor: '#f5f5f7',
    darkTextColor: '#1d1d1f',
    preference: 'auto',
    preferredMinContrast: 0,
};

export function sanitizeColorPreference(value) {
    return (value === 'light' || value === 'dark') ? value : 'auto';
}

function _clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

const SRGB_LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
    const n = i / 255.0;
    SRGB_LINEAR_LUT[i] = n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function _srgbToLinear(c) {
    const idx = c | 0;
    if (idx === c && idx >= 0 && idx <= 255)
        return SRGB_LINEAR_LUT[idx];
    const n = c / 255.0;
    if (n <= 0.04045)
        return n / 12.92;
    return Math.pow((n + 0.055) / 1.055, 2.4);
}

function _luminanceFromRgb(r, g, b) {
    return 0.2126 * _srgbToLinear(r) + 0.7152 * _srgbToLinear(g) + 0.0722 * _srgbToLinear(b);
}

class _ContrastEventHub {
    _listeners = new Set();
    _attached = false;
    _desktop = null;
    _desktopId = 0;
    _a11y = null;
    _a11yId = 0;
    _background = null;
    _backgroundId = 0;
    _displayIds = [];
    _wsId = 0;
    _overviewShowingId = 0;
    _overviewHiddenId = 0;
    _monitorsId = 0;
    _focusWin = null;
    _focusWinIds = [];
    _sceneTimerId = 0;
    _themeSettleTimerId = 0;
    _cachedSystemDark = null;
    _cachedHighContrast = null;

    isHighContrast() {
        if (this._cachedHighContrast !== null && this._attached)
            return this._cachedHighContrast;
        try {
            const s = this._a11y ?? new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.interface' });
            const hc = s.get_boolean('high-contrast');
            if (this._attached)
                this._cachedHighContrast = hc;
            return hc;
        } catch (_e) {
            return false;
        }
    }

    isSystemDark() {
        if (Main.sessionMode?.isGreeter || Main.sessionMode?.isLocked)
            return true;
        if (this._cachedSystemDark !== null && this._attached)
            return this._cachedSystemDark;
        try {
            const s = this._desktop ?? new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            const dark = s.get_string('color-scheme') === 'prefer-dark';
            if (this._attached)
                this._cachedSystemDark = dark;
            return dark;
        } catch (_e) {
            return true;
        }
    }

    subscribe(fn) {
        this._listeners.add(fn);
        if (!this._attached)
            this._attach();
        return () => {
            this._listeners.delete(fn);
            if (this._listeners.size === 0)
                this._detach();
        };
    }

    _emit(reason) {
        for (const fn of [...this._listeners]) {
            try {
                fn(reason);
            } catch (_e) {
            }
        }
    }

    _scheduleScene(delayMs = 140) {
        if (this._sceneTimerId) {
            GLib.Source.remove(this._sceneTimerId);
            this._sceneTimerId = 0;
        }
        this._sceneTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, delayMs, () => {
            this._sceneTimerId = 0;
            this._emit('scene');
            return GLib.SOURCE_REMOVE;
        });
    }

    _bindFocusWindow() {
        this._unbindFocusWindow();
        const win = global.display?.focus_window ?? null;
        if (!win)
            return;
        this._focusWin = win;
        try {
            this._focusWinIds = [
                win.connect('position-changed', () => this._scheduleScene(180)),
                win.connect('size-changed', () => this._scheduleScene(180)),
                win.connect('unmanaged', () => {
                    this._unbindFocusWindow();
                    this._scheduleScene(140);
                }),
            ];
        } catch (_e) {
            this._focusWin = null;
            this._focusWinIds = [];
        }
    }

    _unbindFocusWindow() {
        if (this._focusWin) {
            for (const id of this._focusWinIds) {
                try {
                    this._focusWin.disconnect(id);
                } catch (_e) {
                }
            }
        }
        this._focusWin = null;
        this._focusWinIds = [];
    }

    _attach() {
        if (this._attached)
            return;
        this._attached = true;
        try {
            this._desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            this._cachedSystemDark = this._desktop.get_string('color-scheme') === 'prefer-dark';
            this._desktopId = this._desktop.connect('changed::color-scheme', () => {
                this._cachedSystemDark = this._desktop.get_string('color-scheme') === 'prefer-dark';
                this._emit('theme');
                if (this._themeSettleTimerId)
                    GLib.Source.remove(this._themeSettleTimerId);
                this._themeSettleTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 340, () => {
                    this._themeSettleTimerId = 0;
                    this._emit('scene');
                    return GLib.SOURCE_REMOVE;
                });
            });
        } catch (_e) {
            this._desktop = null;
        }
        try {
            this._a11y = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.interface' });
            this._cachedHighContrast = this._a11y.get_boolean('high-contrast');
            this._a11yId = this._a11y.connect('changed::high-contrast', () => {
                this._cachedHighContrast = this._a11y.get_boolean('high-contrast');
                this._emit('theme');
            });
        } catch (_e) {
            this._a11y = null;
        }
        try {
            this._background = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
            this._backgroundId = this._background.connect('changed', () => this._scheduleScene(450));
        } catch (_e) {
            this._background = null;
        }
        if (global.display) {
            this._displayIds = [
                global.display.connect('notify::focus-window', () => {
                    this._bindFocusWindow();
                    this._scheduleScene(140);
                }),
                global.display.connect('restacked', () => this._scheduleScene(140)),
                global.display.connect('in-fullscreen-changed', () => this._scheduleScene(140)),
                global.display.connect('window-created', () => this._scheduleScene(220)),
            ];
            this._bindFocusWindow();
        }
        if (global.workspace_manager) {
            this._wsId = global.workspace_manager.connect('active-workspace-changed', () => this._scheduleScene(220));
        }
        if (Main.overview) {
            this._overviewShowingId = Main.overview.connect('showing', () => this._scheduleScene(200));
            this._overviewHiddenId = Main.overview.connect('hidden', () => this._scheduleScene(200));
        }
        if (Main.layoutManager) {
            this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._scheduleScene(250));
        }
    }

    _detach() {
        if (!this._attached)
            return;
        this._attached = false;
        this._cachedSystemDark = null;
        this._cachedHighContrast = null;
        if (this._sceneTimerId) {
            GLib.Source.remove(this._sceneTimerId);
            this._sceneTimerId = 0;
        }
        if (this._themeSettleTimerId) {
            GLib.Source.remove(this._themeSettleTimerId);
            this._themeSettleTimerId = 0;
        }
        this._unbindFocusWindow();
        if (this._desktop && this._desktopId) {
            this._desktop.disconnect(this._desktopId);
            this._desktopId = 0;
        }
        this._desktop = null;
        if (this._a11y && this._a11yId) {
            this._a11y.disconnect(this._a11yId);
            this._a11yId = 0;
        }
        this._a11y = null;
        if (this._background && this._backgroundId) {
            this._background.disconnect(this._backgroundId);
            this._backgroundId = 0;
        }
        this._background = null;
        if (global.display) {
            for (const id of this._displayIds)
                global.display.disconnect(id);
        }
        this._displayIds = [];
        if (this._wsId && global.workspace_manager) {
            global.workspace_manager.disconnect(this._wsId);
            this._wsId = 0;
        }
        if (this._overviewShowingId && Main.overview) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }
        if (this._overviewHiddenId && Main.overview) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
        if (this._monitorsId && Main.layoutManager) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
    }
}

const _contrastHub = new _ContrastEventHub();

export function isSystemDark() {
    return _contrastHub.isSystemDark();
}

export function isHighContrast() {
    return _contrastHub.isHighContrast();
}

export function subscribeContrastEvents(listener) {
    return _contrastHub.subscribe(listener);
}

export function decideUseDarkText(luminance, preferDarkText, prevUseDarkText = null) {
    const luma = _clamp(luminance, 0, 1);
    const hc = isHighContrast();
    const darkMax = hc ? 0.17 : DARK_BG_MAX_LUMA;
    const lightMin = hc ? 0.28 : LIGHT_BG_MIN_LUMA;
    if (preferDarkText) {
        if (prevUseDarkText === false)
            return luma > darkMax + LUMA_HYSTERESIS;
        const threshold = prevUseDarkText === null ? darkMax : darkMax - LUMA_HYSTERESIS;
        return luma >= threshold;
    }
    if (prevUseDarkText === true)
        return luma >= lightMin - LUMA_HYSTERESIS;
    const threshold = prevUseDarkText === null ? lightMin : lightMin + LUMA_HYSTERESIS;
    return luma > threshold;
}

function _resolvePreferDarkText(preference) {
    if (preference === 'dark')
        return true;
    if (preference === 'light')
        return false;
    return !isSystemDark();
}

function _trimmedMean(values, trimRatio = 0.2) {
    if (values.length === 0)
        return null;
    if (values.length <= 2) {
        let s = 0;
        for (let i = 0; i < values.length; i++)
            s += values[i];
        return s / values.length;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const trim = Math.floor(sorted.length * trimRatio);
    const start = _clamp(trim, 0, sorted.length - 1);
    const end = _clamp(sorted.length - trim, start + 1, sorted.length);
    let sum = 0.0;
    for (let i = start; i < end; i++)
        sum += sorted[i];
    return sum / (end - start);
}

function _getActorRect(actor) {
    if (!actor || !actor.mapped)
        return null;
    const [x, y, w, h] = getTransformedRect(actor);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0)
        return null;
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(global.stage.width, Math.ceil(x + w));
    const bottom = Math.min(global.stage.height, Math.ceil(y + h));
    if (right <= left || bottom <= top)
        return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function _mergeRects(rects) {
    if (rects.length === 0)
        return null;
    let minX = rects[0].x;
    let minY = rects[0].y;
    let maxX = rects[0].x + rects[0].width;
    let maxY = rects[0].y + rects[0].height;
    for (let i = 1; i < rects.length; i++) {
        const r = rects[i];
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
    }
    return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
    };
}

let _capturePathLogged = false;

function _reportCapturePath(msg) {
    if (_capturePathLogged)
        return;
    _capturePathLogged = true;
    utilsLog(`[Liquid Glass][contrast] ${msg}`);
}

let _readCtx = null;
let _readTemplate = null;
let _readTarget = null;
let _readTargetW = 0;
let _readTargetH = 0;
let _readTargetInUse = false;

function _getReadPipeline() {
    const ctx = coglContext();
    if (!_readTemplate || _readCtx !== ctx) {
        _readCtx = ctx;
        _readTemplate = Cogl.Pipeline.new(ctx);
        _readTemplate.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
    }
    return _readTemplate.copy();
}

function _readTexture(texture, width, height) {
    return new Promise(resolve => {
        Shell.Screenshot.composite_to_stream(texture, 0, 0, width, height, 1, null, 0, 0, 1, Gio.MemoryOutputStream.new_resizable(), (_obj, res) => {
            try {
                resolve(_imageOf(Shell.Screenshot.composite_to_stream_finish(res)));
            }
            catch {
                resolve(null);
            }
        });
    });
}

function _drawAndRead(texture, s0, t0, s1, t1, width, height) {
    let target;
    let usingShared = false;
    if (!_readTargetInUse) {
        if (!_readTarget || _readTargetW !== width || _readTargetH !== height) {
            _readTarget = createTarget(width, height);
            _readTargetW = _readTarget ? width : 0;
            _readTargetH = _readTarget ? height : 0;
        }
        target = _readTarget;
        if (target) {
            _readTargetInUse = true;
            usingShared = true;
        }
    } else {
        target = createTarget(width, height);
    }
    if (!target)
        return Promise.resolve(null);
    const pipeline = _getReadPipeline();
    pipeline.set_layer_texture(0, texture);
    const fb = target.framebuffer;
    fb.orthographic(0, 0, width, height, -1, 1);
    fb.clear4f(Cogl.BufferBit.COLOR, 0, 0, 0, 0);
    fb.draw_textured_rectangle(pipeline, 0, 0, width, height, s0, t0, s1, t1);
    fb.flush();
    const promise = _readTexture(target.texture, width, height);
    if (usingShared) {
        return promise.finally(() => {
            _readTargetInUse = false;
        });
    }
    return promise;
}

function _captureViaStage(rect, maxEdge = SAMPLE_MAX_EDGE) {
    const x = Math.floor(rect.x);
    const y = Math.floor(rect.y);
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    let content;
    try {
        content = paintStageToContent(new Mtk.Rectangle({ x, y, width, height }), scale);
    }
    catch {
        return Promise.resolve(null);
    }
    const texture = content?.get_texture();
    if (!texture)
        return Promise.resolve(null);
    return _drawAndRead(texture, 0, 0, 1, 1, Math.max(1, texture.get_width()), Math.max(1, texture.get_height()));
}

export async function captureLuminanceStrip(rect, maxEdge = 32) {
    if (!rect || rect.width <= 0 || rect.height <= 0)
        return null;
    const shot = await _captureViaStage(rect, maxEdge);
    if (!shot)
        return null;
    const values = luminanceSamplesInRect(shot, undefined, 0, 0, shot.width, shot.height, 1);
    return values.length > 0 ? _trimmedMean(values, 0.25) : null;
}

function _imageOf(pixbuf) {
    if (!pixbuf)
        return null;
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    return {
        data: pixbuf.get_pixels(),
        width,
        height,
        stride: pixbuf.get_rowstride(),
        channels: pixbuf.get_n_channels(),
        step: 1,
    };
}

const LIGHT_FACING = 0.38 / Math.sqrt(1 + 0.38 * 0.38);

export function glassToneOf(values) {
    const get = (name, fallback) => {
        const v = values.get(name);
        return v !== undefined && Number.isFinite(v) ? v : fallback;
    };
    const specular = Math.pow(LIGHT_FACING, Math.max(get('shininess', 42), 1)) * get('specular_intensity', 0) * 0.65;
    const sheen = Math.pow(LIGHT_FACING, 1.65) * get('sheen_intensity', 0);
    return {
        brightness: get('brightness', 1),
        contrast: get('contrast', 1),
        saturation: get('saturation', 1),
        tint: [get('tint_r', 1), get('tint_g', 1), get('tint_b', 1)],
        tintStrength: _clamp(get('tint_strength', 0), 0, 1),
        light: (specular + sheen) * get('surface_light_enabled', 1),
    };
}

export function tonedLuminance(r, g, b, tone) {
    const scb = (c) => 0.5 + ((c / 255) * tone.brightness - 0.5) * tone.contrast;
    let cr = scb(r), cg = scb(g), cb = scb(b);
    const luma = 0.299 * cr + 0.587 * cg + 0.114 * cb;
    const t = tone.tintStrength;
    const finish = (c, tint) => {
        const tinted = Math.max(0, luma + (c - luma) * tone.saturation) * (1 - t) + tint * t;
        return tinted + tone.light - tinted * tone.light;
    };
    cr = finish(cr, tone.tint[0]);
    cg = finish(cg, tone.tint[1]);
    cb = finish(cb, tone.tint[2]);
    const peak = Math.max(1, cr, cg, cb);
    const r8 = Math.round(_clamp(cr / peak, 0, 1) * 255);
    const g8 = Math.round(_clamp(cg / peak, 0, 1) * 255);
    const b8 = Math.round(_clamp(cb / peak, 0, 1) * 255);
    return 0.2126 * SRGB_LINEAR_LUT[r8] + 0.7152 * SRGB_LINEAR_LUT[g8] + 0.0722 * SRGB_LINEAR_LUT[b8];
}

function _overlap(copyRect, rect) {
    const x = Math.max(rect.x, copyRect[0]);
    const y = Math.max(rect.y, copyRect[1]);
    const right = Math.min(rect.x + rect.width, copyRect[2]);
    const bottom = Math.min(rect.y + rect.height, copyRect[3]);
    if (right - x < 1 || bottom - y < 1)
        return null;
    return { x, y, width: right - x, height: bottom - y };
}

function _captureViaBackdrop(copy, rect, maxEdge = SAMPLE_MAX_EDGE) {
    const area = _overlap(copy.rect, rect);
    if (!area)
        return Promise.resolve(null);
    const k = Math.min(1, maxEdge / Math.max(area.width, area.height));
    const [x0, y0, x1, y1] = copy.rect;
    return _drawAndRead(copy.texture, (area.x - x0) / (x1 - x0), (area.y - y0) / (y1 - y0), (area.x + area.width - x0) / (x1 - x0), (area.y + area.height - y0) / (y1 - y0), Math.max(1, Math.round(area.width * k)), Math.max(1, Math.round(area.height * k)));
}

function _outside(rect, [x0, y0, x1, y1]) {
    const right = rect.x + rect.width, bottom = rect.y + rect.height;
    const top = Math.max(rect.y, Math.min(y0, bottom)), base = Math.min(bottom, Math.max(y1, top));
    const strips = [
        { x: rect.x, y: rect.y, width: rect.width, height: top - rect.y },
        { x: rect.x, y: base, width: rect.width, height: bottom - base },
        { x: rect.x, y: top, width: Math.min(x0, right) - rect.x, height: base - top },
        { x: Math.max(x1, rect.x), y: top, width: right - Math.max(x1, rect.x), height: base - top },
    ];
    return strips.filter(r => r.width >= 1 && r.height >= 1);
}

function _bestCopy(rect, drawn) {
    let best = null;
    let bestArea = 0;
    for (const source of drawn) {
        const copy = source.backdropCopy();
        const area = copy ? _overlap(copy.rect, rect) : null;
        if (copy && area && area.width * area.height > bestArea) {
            best = { source, copy };
            bestArea = area.width * area.height;
        }
    }
    return best;
}

export function backdropLuminance(actor, root = null) {
    let node = actor;
    for (let depth = 0; node && depth < BACKDROP_SEARCH_DEPTH; depth++) {
        const color = node.get_theme_node?.().get_background_color();
        if (color && color.alpha >= BACKDROP_COVERS_GLASS_ALPHA) {
            return {
                luminance: _luminanceFromRgb(color.red, color.green, color.blue),
                alpha: color.alpha,
            };
        }
        if (root && node === root)
            break;
        node = node.get_parent();
    }
    return null;
}

function _visibleTargets(actors) {
    const targets = [];
    const rects = [];
    for (const actor of actors) {
        const rect = _getActorRect(actor);
        if (!rect)
            continue;
        targets.push(actor);
        rects.push(rect);
    }
    return { targets, rects };
}

function _rootOrMergedRect(root, rects) {
    const rootRect = root ? _getActorRect(root) : null;
    return rootRect ?? _mergeRects(rects);
}

function _readSignature(paintSignature) {
    if (!paintSignature)
        return null;
    const v = paintSignature();
    return Number.isFinite(v) ? v : null;
}

function _skipKey(rects, config) {
    const sys = isSystemDark() ? 'd' : 'l';
    const hc = isHighContrast() ? 'h' : 'n';
    return rects
        .map(r => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`)
        .join(';') + `|${config.samplePerElement ? 'e' : 'm'}|${config.preference ?? 'auto'}|${sys}${hc}|${config.lightTextColor}|${config.darkTextColor}`;
}

function _pixelLuminance(data, idx, channels, tone) {
    const measure = (r, g, b) => tone ? tonedLuminance(r, g, b, tone) : _luminanceFromRgb(r, g, b);
    if (channels <= 3)
        return measure(data[idx], data[idx + 1], data[idx + 2]);
    const a = data[idx + 3];
    if (a < 32)
        return null;
    if (a >= 255)
        return measure(data[idx], data[idx + 1], data[idx + 2]);
    const inv = 255.0 / a;
    const unpremultiply = (c) => _clamp(Math.round(c * inv), 0, 255);
    return measure(unpremultiply(data[idx]), unpremultiply(data[idx + 1]), unpremultiply(data[idx + 2]));
}

function luminanceSamplesInRect(shot, tone, x0, y0, x1, y1, step) {
    const { data, stride, channels } = shot;
    const values = [];
    for (let y = y0; y < y1; y += step) {
        const row = y * stride;
        for (let x = x0; x < x1; x += step) {
            const luma = _pixelLuminance(data, row + x * channels, channels, tone);
            if (luma !== null)
                values.push(luma);
        }
    }
    return values;
}

export function luminanceSamples(shot, tone) {
    return luminanceSamplesInRect(shot, tone, 0, 0, shot.width, shot.height, shot.step);
}

export class StageContrastSampler {
    _lastUseDark = null;
    _lastPreferDark = null;
    _perActorUseDark = new WeakMap();
    _lastRect = null;
    _lastDecided = null;
    _unchangedSignature = null;
    _unchangedKey = '';
    _epoch = 0;
    _generation = 0;

    invalidate() {
        this._generation++;
        this._unchangedSignature = null;
        this._unchangedKey = '';
    }

    reset() {
        this.invalidate();
        this._lastRect = null;
        this._lastUseDark = null;
        this._lastPreferDark = null;
        this._perActorUseDark = new WeakMap();
    }

    resetThemePreference() {
        this.invalidate();
        this._lastUseDark = null;
        this._lastPreferDark = null;
        this._perActorUseDark = new WeakMap();
    }

    async sampleLuminance(rect, tone) {
        if (!rect || rect.width <= 0 || rect.height <= 0)
            return null;
        const shot = await _captureViaStage(rect);
        if (!shot) {
            _reportCapturePath('screen capture failed; adaptive text colors will keep their current values');
            return null;
        }
        return this._meanOf(shot, tone);
    }

    async sampleBackdropLuminance(copy, rect, tone) {
        const shot = await _captureViaBackdrop(copy, rect);
        if (!shot) {
            _reportCapturePath('backdrop read failed; adaptive text colors will keep their current values');
            return null;
        }
        return this._meanOf(shot, tone);
    }

    _meanOf(shot, tone) {
        const values = luminanceSamples(shot, tone);
        if (values.length === 0) {
            _reportCapturePath('capture produced no usable pixels (everything below the alpha cutoff)');
            return null;
        }
        return _trimmedMean(values, 0.25);
    }

    _measure(rect, sources) {
        if (sources.length === 0)
            return this.sampleLuminance(rect);
        const drawn = sources.filter(source => source.mapped && source.get_paint_opacity() > 0);
        const best = _bestCopy(rect, drawn);
        if (best)
            return this.sampleBackdropLuminance(best.copy, rect, glassToneOf(best.source.uniformValues));
        return this.sampleLuminance(rect, drawn.length === 0 ? glassToneOf(sources[0].uniformValues) : undefined);
    }

    async _measureGrowing(rect, sources) {
        const drawn = sources.filter(source => source.mapped && source.get_paint_opacity() > 0);
        const best = _bestCopy(rect, drawn);
        if (!best)
            return this._measure(rect, sources);
        const tone = glassToneOf(best.source.uniformValues);
        const covered = _overlap(best.copy.rect, rect);
        const parts = [{ rect: covered, luma: this.sampleBackdropLuminance(best.copy, covered, tone) },
            ..._outside(rect, best.copy.rect).map(strip => ({ rect: strip, luma: this.sampleLuminance(strip, tone) }))];
        let sum = 0, weight = 0;
        for (const part of parts) {
            const luma = await part.luma;
            if (luma === null)
                return null;
            sum += luma * part.rect.width * part.rect.height;
            weight += part.rect.width * part.rect.height;
        }
        return sum / weight;
    }

    decideTextColor(luminance, config = AdaptiveContrastConfig, targetActor = null) {
        if (luminance === null || luminance === undefined || !Number.isFinite(luminance))
            return null;
        const preferDark = _resolvePreferDarkText(config.preference ?? 'auto');
        if (this._lastPreferDark !== null && this._lastPreferDark !== preferDark) {
            this._lastUseDark = null;
            this._perActorUseDark = new WeakMap();
        }
        this._lastPreferDark = preferDark;

        if (config.samplePerElement) {
            const prev = targetActor ? (this._perActorUseDark.get(targetActor) ?? null) : null;
            const useDark = decideUseDarkText(luminance, preferDark, prev);
            if (targetActor)
                this._perActorUseDark.set(targetActor, useDark);
            return useDark ? config.darkTextColor : config.lightTextColor;
        }

        const useDark = decideUseDarkText(luminance, preferDark, this._lastUseDark);
        this._lastUseDark = useDark;
        return useDark ? config.darkTextColor : config.lightTextColor;
    }

    _backdropColorFor(actor, config, root) {
        const backdrop = backdropLuminance(actor, root);
        if (backdrop === null)
            return null;
        return this.decideTextColor(backdrop.luminance, { ...config, samplePerElement: true }, actor);
    }

    async chooseColorsForActors(actors, config = AdaptiveContrastConfig, root = null, paintSignature, backdrops) {
        const { targets, rects } = _visibleTargets(actors);
        if (targets.length === 0)
            return new Map();
        const merged = config.samplePerElement ? null : _rootOrMergedRect(root, rects);
        const mergedRects = merged ? [merged] : [];
        const sampledRects = config.samplePerElement ? rects : mergedRects;
        const key = _skipKey(config.samplePerElement ? rects : [...sampledRects, ...rects], config);
        const before = _readSignature(paintSignature);
        const generation = this._generation;
        if (before !== null && before === this._unchangedSignature && key === this._unchangedKey)
            return new Map();
        const settle = (stable) => {
            const after = _readSignature(paintSignature);
            if (stable && generation === this._generation && before !== null && after !== null &&
                after - before <= sampledRects.length) {
                this._unchangedSignature = after;
                this._unchangedKey = key;
            }
            else {
                this.invalidate();
            }
        };
        const sources = backdrops?.() ?? [];
        if (config.samplePerElement)
            return this._choosePerElement(targets, rects, config, settle, sources);
        if (!merged)
            return new Map();
        return this._chooseMerged(actors, merged, config, settle, sources);
    }

    async chooseColorFor(rect, config, sources) {
        const epoch = ++this._epoch;
        const luma = await this._measureGrowing(rect, sources);
        if (epoch !== this._epoch || luma === null)
            return null;
        this.invalidate();
        this._lastRect = rect;
        const color = this.decideTextColor(luma, config);
        this._lastDecided = color;
        return color;
    }

    _resetIfRegionMoved(merged) {
        const last = this._lastRect;
        const moved = !last || ['x', 'y', 'width', 'height'].some(k => Math.abs(merged[k] - last[k]) > 4);
        if (moved)
            this._lastUseDark = null;
        this._lastRect = merged;
    }

    async _chooseMerged(targets, merged, config, settle, sources) {
        const result = new Map();
        this._resetIfRegionMoved(merged);
        const epoch = this._epoch;
        const luma = await this._measure(merged, sources);
        if (luma === null || epoch !== this._epoch) {
            this.invalidate();
            return result;
        }
        const color = this.decideTextColor(luma, config);
        settle(color !== null);
        this._lastDecided = color;
        if (color)
            for (const actor of targets)
                result.set(actor, color);
        return result;
    }

    async _choosePerElement(targets, rects, config, settle, sources) {
        const result = new Map();
        const merged = _mergeRects(rects);
        let shot = null;
        let shotRect = merged;
        let tone = undefined;
        if (merged) {
            if (sources.length === 0) {
                shot = await _captureViaStage(merged, SAMPLE_MAX_EDGE_MERGED);
            } else {
                const drawn = sources.filter(source => source.mapped && source.get_paint_opacity() > 0);
                const best = _bestCopy(merged, drawn);
                if (best) {
                    const area = _overlap(best.copy.rect, merged);
                    if (area) {
                        shotRect = area;
                        tone = glassToneOf(best.source.uniformValues);
                        shot = await _captureViaBackdrop(best.copy, merged, SAMPLE_MAX_EDGE_MERGED);
                    }
                } else {
                    tone = drawn.length === 0 ? glassToneOf(sources[0].uniformValues) : undefined;
                    shot = await _captureViaStage(merged, SAMPLE_MAX_EDGE_MERGED);
                }
            }
        }
        if (shot && shotRect && shotRect.width > 0 && shotRect.height > 0) {
            for (let i = 0; i < targets.length; i++) {
                const r = rects[i];
                let luma = null;
                if (
                    r.x >= shotRect.x - 2 &&
                    r.y >= shotRect.y - 2 &&
                    r.x + r.width <= shotRect.x + shotRect.width + 2 &&
                    r.y + r.height <= shotRect.y + shotRect.height + 2
                ) {
                    const sx0 = Math.max(0, Math.floor(((r.x - shotRect.x) / shotRect.width) * shot.width));
                    const sy0 = Math.max(0, Math.floor(((r.y - shotRect.y) / shotRect.height) * shot.height));
                    const sx1 = Math.min(shot.width, Math.ceil(((r.x + r.width - shotRect.x) / shotRect.width) * shot.width));
                    const sy1 = Math.min(shot.height, Math.ceil(((r.y + r.height - shotRect.y) / shotRect.height) * shot.height));
                    if (sx1 > sx0 && sy1 > sy0) {
                        const values = luminanceSamplesInRect(shot, tone, sx0, sy0, sx1, sy1, 1);
                        if (values.length > 0)
                            luma = _trimmedMean(values, 0.25);
                    }
                }
                if (luma === null)
                    luma = await this._measure(r, sources);
                if (luma === null) {
                    this.invalidate();
                    return result;
                }
                const color = this.decideTextColor(luma, config, targets[i]);
                if (color)
                    result.set(targets[i], color);
            }
            settle(true);
            return result;
        }
        for (let i = 0; i < targets.length; i++) {
            const luma = await this._measure(rects[i], sources);
            if (luma === null) {
                this.invalidate();
                return result;
            }
            const color = this.decideTextColor(luma, config, targets[i]);
            if (color)
                result.set(targets[i], color);
        }
        settle(true);
        return result;
    }
}

export class AdaptiveTextColor {
    _roots;
    _glasses;
    _logger;
    _label;
    _options;
    _sampler = new StageContrastSampler();
    _config = { ...AdaptiveContrastConfig, enabled: true, samplePerElement: false };
    _debounceId = 0;
    _unsubscribe = null;
    _active = false;
    _inFlight = false;
    _first = true;
    _pending = 0;
    _styled = new Map();

    constructor(_roots, _glasses, _logger, _label, _options = {}) {
        this._roots = _roots;
        this._glasses = _glasses;
        this._logger = _logger;
        this._label = _label;
        this._options = _options;
    }

    start(intervalMs, preference, preferredMinContrast = 0) {
        this._config.sampleIntervalMs = intervalMs;
        this._config.preference = preference;
        this._config.preferredMinContrast = preferredMinContrast;
        this.stop();
        this._active = true;
        this._first = true;
        this._sampler.reset();
        this._unsubscribe = subscribeContrastEvents((reason) => {
            if (!this._active)
                return;
            if (reason === 'theme')
                this._sampler.resetThemePreference();
            else
                this._sampler.invalidate();
            this._scheduleUpdate(reason === 'theme' ? 40 : 120);
        });
        this.update();
    }

    stop() {
        this._active = false;
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        if (this._debounceId) {
            GLib.Source.remove(this._debounceId);
            this._debounceId = 0;
        }
    }

    _scheduleUpdate(delayMs = 120) {
        if (!this._active)
            return;
        if (this._debounceId)
            GLib.Source.remove(this._debounceId);
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, delayMs, () => {
            this._debounceId = 0;
            if (this._active)
                this.update();
            return GLib.SOURCE_REMOVE;
        });
    }

    invalidate() {
        this._sampler.invalidate();
        this._scheduleUpdate(100);
    }

    isAnimating() {
        for (const actor of this._styled.keys()) {
            if (adaptiveColorTweener.isAnimating(actor))
                return true;
        }
        return false;
    }

    update() {
        if (!this._active || this._inFlight || this._pending > 0)
            return;
        if (this._options.held?.()) {
            this._scheduleUpdate(120);
            return;
        }
        const targets = [];
        for (const root of this._roots()) {
            if (!this._options.ownColor)
                collectText(root, targets);
            else if (root.visible)
                targets.push(root);
        }
        if (targets.length === 0)
            return;
        this._inFlight = true;
        const skip = this._first;
        this._first = false;
        const glasses = () => this._glasses().filter(g => g.mapped);
        this._sampler.chooseColorsForActors(targets, this._config, null, () => glasses().reduce((sum, g) => sum + (g.paintCount ?? NaN), 0), glasses)
            .then(colors => {
            if (!this._active)
                return;
            const batch = GLib.get_monotonic_time();
            for (const [actor, color] of colors)
                this._apply(actor, color, skip, batch);
        })
            .catch(e => this._logger.error(`[Liquid Glass] ${this._label} text color update failed: ${e}`))
            .finally(() => { this._inFlight = false; });
    }

    colorFor(rect) {
        if (!this._active)
            return;
        this._pending++;
        this._sampler.chooseColorFor(rect, this._config, this._glasses())
            .then(color => {
            if (!this._active || !color)
                return;
            const batch = GLib.get_monotonic_time();
            for (const root of this._roots())
                this._apply(root, color, true, batch);
        })
            .catch(e => this._logger.error(`[Liquid Glass] ${this._label} text color update failed: ${e}`))
            .finally(() => { this._pending--; });
    }

    _apply(actor, color, skip, batch) {
        if (!(actor instanceof St.Widget) || !isActorValid(actor))
            return;
        let entry = this._styled.get(actor);
        if (!entry) {
            entry = { style: actor.get_style() ?? '', destroyId: 0, color: '' };
            entry.destroyId = actor.connect('destroy', () => {
                adaptiveColorTweener.cancel(actor);
                this._styled.delete(actor);
            });
            this._styled.set(actor, entry);
        }
        const reset = entry.color !== '' && (actor.get_style() ?? '') === entry.style && !adaptiveColorTweener.isAnimating(actor);
        if (entry.color === color && !skip && !reset)
            return;
        entry.color = color;
        const own = entry.style.trim();
        const prefix = own ? `${own.replace(/;$/, '')}; ` : '';
        const apply = (r, g, b, a) => {
            const rgba = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
            actor.set_style(`${prefix}color: ${rgba}; -st-icon-foreground-color: ${rgba};`);
        };
        const target = hexToRgb(color);
        if (skip) {
            adaptiveColorTweener.cancel(actor);
            apply(target.r, target.g, target.b, 1);
            return;
        }
        const start = actor.get_theme_node().get_foreground_color();
        const startRgb = { r: start.red, g: start.green, b: start.blue };
        adaptiveColorTweener.add(actor, {
            startRgb, startAlpha: start.alpha / 255,
            targetRgb: target, targetAlpha: 1,
            crossFade: resolveCrossFade(startRgb, target),
            durationMs: COLOR_TWEEN_MS,
            apply,
            coalesce: true,
        }, batch);
    }

    clear() {
        this.stop();
        for (const [actor, entry] of this._styled) {
            adaptiveColorTweener.cancel(actor);
            actor.disconnect(entry.destroyId);
            actor.set_style(entry.style || null);
        }
        this._styled.clear();
    }
}

function collectText(actor, out) {
    if (!actor.visible)
        return;
    if (actor instanceof St.Label || actor instanceof St.Icon) {
        out.push(actor);
        return;
    }
    for (const child of actor.get_children())
        collectText(child, out);
}

export class AdaptiveClassContrast {
    _opts;
    _sampler = new StageContrastSampler();
    _states = new WeakMap();
    _debounceId = 0;
    _idleId = 0;
    _unsubscribe = null;
    _inFlight = false;
    _active = false;
    _epoch = 0;
    _lastIsLight = null;

    constructor(opts) {
        this._opts = opts;
    }

    isEnabled() {
        try {
            return Boolean(this._opts.getEnabled ? this._opts.getEnabled() : true);
        } catch (_e) {
            return true;
        }
    }

    _fallbackIsLight() {
        try {
            return this._opts.fallbackIsDark ? !this._opts.fallbackIsDark() : !isSystemDark();
        } catch (_e) {
            return false;
        }
    }

    _preference() {
        try {
            return sanitizeColorPreference(this._opts.getPreference?.());
        } catch (_e) {
            return 'auto';
        }
    }

    _config(samplePerElement) {
        return {
            ...AdaptiveContrastConfig,
            enabled: true,
            samplePerElement,
            preference: this._preference(),
        };
    }

    _applyActorClass(actor, isLight) {
        if (!(actor instanceof St.Widget) || !isActorValid(actor))
            return;
        const {lightClass, darkClass} = this._opts;
        const target = isLight ? lightClass : darkClass;
        const other = isLight ? darkClass : lightClass;
        if (other && actor.has_style_class_name?.(other))
            actor.remove_style_class_name(other);
        if (target && !actor.has_style_class_name?.(target))
            actor.add_style_class_name(target);
        this._states.set(actor, isLight);
    }

    _applyAll(targets, isLight) {
        this._lastIsLight = isLight;
        for (const actor of targets)
            this._applyActorClass(actor, isLight);
    }

    applyPending(targets) {
        if (!targets || targets.length === 0)
            return;
        const fallback = this._lastIsLight ?? this._fallbackIsLight();
        for (const actor of targets) {
            const known = this._states.get(actor);
            this._applyActorClass(actor, known !== undefined ? known : fallback);
        }
    }

    _scheduleUpdate(delayMs = 100) {
        if (!this._active)
            return;
        if (this._debounceId)
            GLib.Source.remove(this._debounceId);
        const epoch = this._epoch;
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, delayMs, () => {
            this._debounceId = 0;
            if (this._active && epoch === this._epoch)
                this.update();
            return GLib.SOURCE_REMOVE;
        });
    }

    start(skipInitial = true) {
        this.stop(false);
        this._active = true;
        const epoch = ++this._epoch;
        this._sampler.reset();

        if (!this.isEnabled()) {
            this.stop(true);
            return;
        }

        const targets = this._opts.getTargets?.() ?? [];
        this.applyPending(targets);

        this._unsubscribe = subscribeContrastEvents((reason) => {
            if (!this._active || epoch !== this._epoch)
                return;
            if (reason === 'theme') {
                this._lastIsLight = null;
                this._sampler.resetThemePreference();
            } else {
                this._sampler.invalidate();
            }
            this._scheduleUpdate(reason === 'theme' ? 40 : 120);
        });

        if (skipInitial) {
            this._idleId = GLib.idle_add(GLib.PRIORITY_HIGH, () => {
                this._idleId = 0;
                if (!this._active || epoch !== this._epoch)
                    return GLib.SOURCE_REMOVE;
                this._sampleInitialOrUpdate(epoch);
                return GLib.SOURCE_REMOVE;
            });
        } else {
            this.update();
        }
    }

    stop(clearApplied = false) {
        this._active = false;
        this._epoch++;
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        if (this._idleId) {
            GLib.Source.remove(this._idleId);
            this._idleId = 0;
        }
        if (this._debounceId) {
            GLib.Source.remove(this._debounceId);
            this._debounceId = 0;
        }
        if (clearApplied)
            this.clearClasses();
    }

    invalidate() {
        this._sampler.invalidate();
        this._scheduleUpdate(90);
    }

    clearClasses() {
        const {lightClass, darkClass} = this._opts;
        const targets = this._opts.getTargets?.() ?? [];
        for (const actor of targets) {
            if (!isActorValid(actor))
                continue;
            if (lightClass)
                actor.remove_style_class_name?.(lightClass);
            if (darkClass)
                actor.remove_style_class_name?.(darkClass);
        }
        this._states = new WeakMap();
        this._lastIsLight = null;
    }

    async _sampleInitialOrUpdate(epoch) {
        if (!this._active || epoch !== this._epoch || !this.isEnabled())
            return;
        const initialRect = this._opts.getInitialRect?.();
        if (initialRect && initialRect.width > 0 && initialRect.height > 0) {
            if (this._inFlight)
                return;
            this._inFlight = true;
            try {
                const glasses = (this._opts.getGlasses?.() ?? []).filter(g => g && isActorValid(g));
                const color = await this._sampler.chooseColorFor(
                    initialRect,
                    this._config(false),
                    glasses
                );
                if (!this._active || epoch !== this._epoch || !color)
                    return;
                const isLight = color === AdaptiveContrastConfig.darkTextColor;
                const targets = this._opts.getTargets?.() ?? [];
                this._applyAll(targets, isLight);
                if (this._opts.perElement)
                    this._scheduleUpdate(180);
            } catch (e) {
                this._opts.logger?.error?.(`[Liquid Glass] ${this._opts.label ?? 'surface'} adaptive contrast init failed: ${e}`);
            } finally {
                this._inFlight = false;
            }
            return;
        }
        this.update();
    }

    update() {
        if (!this._active || this._inFlight || !this.isEnabled())
            return;
        if (this._opts.shouldDefer?.()) {
            this._scheduleUpdate(120);
            return;
        }
        const targets = (this._opts.getTargets?.() ?? []).filter(a => a && isActorValid(a) && a.visible && a.mapped);
        if (targets.length === 0)
            return;
        const epoch = this._epoch;
        const perElement = Boolean(this._opts.perElement && targets.length > 1);
        const glassesFn = () => (this._opts.getGlasses?.() ?? []).filter(g => g && isActorValid(g) && g.mapped);
        const paintSig = () => {
            const gs = glassesFn();
            return gs.length > 0 ? gs.reduce((sum, g) => sum + (g.paintCount ?? NaN), 0) : NaN;
        };
        this._inFlight = true;
        this._sampler
            .chooseColorsForActors(
                targets,
                this._config(perElement),
                this._opts.getRoot?.() ?? null,
                paintSig,
                glassesFn
            )
            .then(colorMap => {
                if (!this._active || epoch !== this._epoch || !this.isEnabled())
                    return;
                if (!colorMap || colorMap.size === 0)
                    return;
                let anyLight = null;
                for (const [actor, color] of colorMap.entries()) {
                    const isLight = color === AdaptiveContrastConfig.darkTextColor;
                    if (anyLight === null)
                        anyLight = isLight;
                    this._applyActorClass(actor, isLight);
                }
                if (anyLight !== null && !perElement)
                    this._lastIsLight = anyLight;
            })
            .catch(e => {
                this._opts.logger?.error?.(`[Liquid Glass] ${this._opts.label ?? 'surface'} adaptive contrast update failed: ${e}`);
            })
            .finally(() => {
                this._inFlight = false;
            });
    }

    destroy() {
        this.stop(false);
        this._states = new WeakMap();
    }
}
