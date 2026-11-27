import Cogl from 'gi://Cogl';
import { BlurRenderer, ShaderPipelines, SHAPE_LAYER, RenderPasses, clearSharedPipelines } from './pipelines.js';
import { setUniformArray } from '../shellVersion.js';
import { hexToColorArray } from '../animation.js';
export const MAX_GLASS_REGIONS = 64;

export class GlassRenderer {
    passes;
    pipelines;
    blur;
    uniforms;
    geometry;
    material;
    _outline = null;
    _repaint;
    _shapeTexture = null;
    _compositeColor = new Cogl.Color();
    _lastPaintOpacity = -1;
    _boundLayerTex = null;
    _boundShapeTex = null;
    _regionScratch = null;
    _lastRegionCount = -1;

    constructor(params) {
        this._repaint = params.repaint;
        this.passes = new RenderPasses();
        this.pipelines = new ShaderPipelines(params.logger, params.shapeTexture ?? false);
        this.blur = new BlurRenderer(this.pipelines, this.passes, () => this._repaint());
        this.uniforms = new UniformState();
        this.geometry = new GlassGeometry(this.uniforms.values);
        this.material = new MaterialSettings(params.settings, this.uniforms, this.blur, params.setDiagnostics, () => this._repaintIfDirty());
        this.material.initialize();
        if (params.settings && params.outline) {
            this._outline = new OutlineBinding(params.settings, params.outline, this.uniforms, () => this._repaintIfDirty());
            this._outline.initialize();
        }
    }

    prepare(ctx) {
        if (!this.pipelines.composite) {
            this.pipelines.initialize(ctx);
            this._boundLayerTex = null;
            this._boundShapeTex = null;
            this._lastPaintOpacity = -1;
            this.uniforms.attach(this.pipelines.composite);
        }
        if (this.blur.needsCompile)
            this.blur.compilePending(ctx);
    }

    bindBackdrop(unblurredTex, blurRect) {
        const compPipeline = this.pipelines.composite;
        const haveBlur = this.blur.passCount > 0 && this.blur.result !== null;
        this.uniforms.set('blur_rect_x', blurRect[0]);
        this.uniforms.set('blur_rect_y', blurRect[1]);
        this.uniforms.set('blur_rect_w', blurRect[2]);
        this.uniforms.set('blur_rect_h', blurRect[3]);
        const layerTex = haveBlur ? this.blur.result : unblurredTex;
        this.uniforms.set('blur_tex_w', layerTex.get_width());
        this.uniforms.set('blur_tex_h', layerTex.get_height());
        if (layerTex !== this._boundLayerTex) {
            compPipeline.set_layer_texture(0, layerTex);
            compPipeline.set_layer_texture(1, layerTex);
            this._boundLayerTex = layerTex;
        }
        if (this._shapeTexture && this._shapeTexture !== this._boundShapeTex) {
            compPipeline.set_layer_texture(SHAPE_LAYER, this._shapeTexture);
            this._boundShapeTex = this._shapeTexture;
        }
        this.uniforms.flush();
    }

    addComposite(node, drawRect, drawUV, paintOpacity) {
        if (paintOpacity !== this._lastPaintOpacity) {
            const opacity = paintOpacity / 255;
            this._compositeColor.init_from_4f(opacity, opacity, opacity, opacity);
            this.pipelines.composite.set_color(this._compositeColor);
            this._lastPaintOpacity = paintOpacity;
        }
        this.passes.composite(node, this.pipelines.composite, drawRect, drawUV);
    }

    reloadShaders() {
        clearSharedPipelines();
        this._boundLayerTex = null;
        this._boundShapeTex = null;
        this._lastPaintOpacity = -1;
        this.pipelines.clear();
        this.uniforms.attach(null);
        this.blur.reload();
        this._repaint();
    }

    cleanup() {
        this._shapeTexture = null;
        this._boundLayerTex = null;
        this._boundShapeTex = null;
        this._lastPaintOpacity = -1;
        this._regionScratch = null;
        this._lastRegionCount = -1;
        this._outline?.clear();
        this._outline = null;
        this.material.clear();
        this.blur.clear();
        this.passes.clear();
        this.pipelines.clear();
        this.uniforms.clear();
    }

    _repaintIfDirty() {
        if (this.uniforms.takeDirty())
            this._repaint();
    }

    getResolution() {
        return [
            this.uniforms.values.get('resolution_x') ?? 0,
            this.uniforms.values.get('resolution_y') ?? 0,
        ];
    }

    setBlurRectEnabled(enabled) {
        this.geometry.blurEnabled = enabled;
        this.blur.invalidate();
        this._repaint();
    }

    setCompositeRectEnabled(enabled) {
        this.geometry.compositeEnabled = enabled;
        this._repaint();
    }

    setEdgeTapsEnabled(enabled) {
        this.uniforms.set('edge_taps_enabled', enabled ? 1.0 : 0.0);
        this._repaintIfDirty();
    }

    setEarlyExitEnabled(enabled) {
        this.uniforms.set('early_exit_enabled', enabled ? 1.0 : 0.0);
        this._repaintIfDirty();
    }

    setDebugView(mode) {
        this.uniforms.set('debug_view', mode);
        this._repaintIfDirty();
    }

    setIsDock(isDock) {
        this.uniforms.set('isDock', isDock ? 1.0 : 0.0);
    }

    setSurfaceLightEnabled(_enabled) {
        this.uniforms.set('surface_light_enabled', 1.0);
        this._repaintIfDirty();
    }

    setCornerSmoothingEnabled(_enabled) {
        this.uniforms.set('corner_smoothing_enabled', 1.0);
        this._repaintIfDirty();
    }

    setPadding(pad) {
        this.uniforms.set('padding', pad);
    }

    setShadowMaxRadius(radius) {
        this.uniforms.set('shadow_max_radius', radius);
    }

    setBlurMethod(method) {
        this.blur.setBlurMethod(method);
    }

    setBlurRadius(radius) {
        this.blur.setBlurRadius(radius);
        this._repaintIfDirty();
    }

    setTintColor(r, g, b) {
        this.uniforms.set('tint_r', r);
        this.uniforms.set('tint_g', g);
        this.uniforms.set('tint_b', b);
        this._repaintIfDirty();
    }

    setTintStrength(strength) {
        this.uniforms.set('tint_strength', strength);
        this._repaintIfDirty();
    }

    setCornerRadius(radius) {
        this.uniforms.set('corner_radius', radius);
        this._repaintIfDirty();
    }

    setOutline(width, r = 1.0, g = 1.0, b = 1.0) {
        this.uniforms.set('outline_width', width);
        this.uniforms.set('outline_r', r);
        this.uniforms.set('outline_g', g);
        this.uniforms.set('outline_b', b);
        this._repaintIfDirty();
    }

    setTooltipPointer(side, size, offset = 0.0) {
        this.uniforms.set('tooltip_pointer_side', side);
        this.uniforms.set('tooltip_pointer_size', size);
        this.uniforms.set('tooltip_pointer_offset', offset);
        this._repaintIfDirty();
    }

    setAnimationScale(scale) {
        if (this.material.setAnimationScale(scale))
            this._repaintIfDirty();
    }

    setResolution(width, height) {
        this.uniforms.set('resolution_x', width);
        this.uniforms.set('resolution_y', height);
        this._repaintIfDirty();
    }

    setGlassGeometry(x, y, w, h) {
        this.uniforms.set('dock_x', x);
        this.uniforms.set('dock_y', y);
        this.uniforms.set('dock_w', w);
        this.uniforms.set('dock_h', h);
        this.geometry.rect[0] = x;
        this.geometry.rect[1] = y;
        this.geometry.rect[2] = w;
        this.geometry.rect[3] = h;
        this._repaintIfDirty();
    }

    setShapeTexture(texture, range, band) {
        this._shapeTexture = texture;
        this.uniforms.set('shape_range', range);
        this.uniforms.set('shape_band', band);
        this.uniforms.takeDirty();
        this._repaint();
    }

    setMultiRegionMode(enabled) {
        this.uniforms.set('multi_region_mode', enabled ? 1.0 : 0.0);
        this.geometry.multiRegion = enabled;
        this._repaintIfDirty();
    }

    setGlassRegions(regions) {
        const count = Math.min(regions.length, MAX_GLASS_REGIONS);
        if (regions.length > MAX_GLASS_REGIONS) {
            log(`[Fluid Glass] Warning: region count ${regions.length} exceeds MAX_GLASS_REGIONS (${MAX_GLASS_REGIONS})`);
        }
        let s = this._regionScratch;
        if (!s) {
            s = {
                rx: new Array(MAX_GLASS_REGIONS).fill(0.0),
                ry: new Array(MAX_GLASS_REGIONS).fill(0.0),
                rw: new Array(MAX_GLASS_REGIONS).fill(0.0),
                rh: new Array(MAX_GLASS_REGIONS).fill(0.0),
                rTintR: new Array(MAX_GLASS_REGIONS).fill(1.0),
                rTintG: new Array(MAX_GLASS_REGIONS).fill(1.0),
                rTintB: new Array(MAX_GLASS_REGIONS).fill(1.0),
                rBaseStrength: new Array(MAX_GLASS_REGIONS).fill(0.0),
                rRadius: new Array(MAX_GLASS_REGIONS).fill(0.0),
            };
            this._regionScratch = s;
        }
        let changed = count !== this._lastRegionCount;
        for (let i = 0; i < count; i++) {
            const region = regions[i];
            const tintR = region.tintR ?? 1.0;
            const tintG = region.tintG ?? 1.0;
            const tintB = region.tintB ?? 1.0;
            const baseStrength = region.baseStrength ?? 0.0;
            const cornerRadius = region.cornerRadius ?? 0.0;
            if (!changed &&
                s.rx[i] === region.x && s.ry[i] === region.y &&
                s.rw[i] === region.w && s.rh[i] === region.h &&
                s.rTintR[i] === tintR && s.rTintG[i] === tintG && s.rTintB[i] === tintB &&
                s.rBaseStrength[i] === baseStrength && s.rRadius[i] === cornerRadius)
                continue;
            changed = true;
            s.rx[i] = region.x;
            s.ry[i] = region.y;
            s.rw[i] = region.w;
            s.rh[i] = region.h;
            s.rTintR[i] = tintR;
            s.rTintG[i] = tintG;
            s.rTintB[i] = tintB;
            s.rBaseStrength[i] = baseStrength;
            s.rRadius[i] = cornerRadius;
        }
        if (!changed)
            return;
        for (let i = count; i < this._lastRegionCount; i++) {
            s.rx[i] = 0.0;
            s.ry[i] = 0.0;
            s.rw[i] = 0.0;
            s.rh[i] = 0.0;
            s.rTintR[i] = 1.0;
            s.rTintG[i] = 1.0;
            s.rTintB[i] = 1.0;
            s.rBaseStrength[i] = 0.0;
            s.rRadius[i] = 0.0;
        }
        this._lastRegionCount = count;
        const geomRegions = new Array(count);
        for (let i = 0; i < count; i++)
            geomRegions[i] = [s.rx[i], s.ry[i], s.rw[i], s.rh[i]];
        this.geometry.regions = geomRegions;
        this.uniforms.set('region_count', count);
        this.uniforms.setArray('region_x', s.rx);
        this.uniforms.setArray('region_y', s.ry);
        this.uniforms.setArray('region_w', s.rw);
        this.uniforms.setArray('region_h', s.rh);
        this.uniforms.setArray('region_tint_r', s.rTintR);
        this.uniforms.setArray('region_tint_g', s.rTintG);
        this.uniforms.setArray('region_tint_b', s.rTintB);
        this.uniforms.setArray('region_base_strength', s.rBaseStrength);
        this.uniforms.setArray('region_r', s.rRadius);
        this._repaintIfDirty();
    }

    setBrightness(brightness) {
        this.uniforms.set('brightness', brightness);
        this._repaintIfDirty();
    }

    setContrast(contrast) {
        this.uniforms.set('contrast', contrast);
        this._repaintIfDirty();
    }

    setSaturation(saturation) {
        this.uniforms.set('saturation', saturation);
        this._repaintIfDirty();
    }
}

export class GlassGeometry {
    _uniforms;

    constructor(_uniforms) {
        this._uniforms = _uniforms;
        this.blurEnabled = GlassGeometry.USE_BLUR_RECT;
        this.compositeEnabled = GlassGeometry.USE_COMPOSITE_RECT;
    }

    rect = [0, 0, 0, 0];
    regions = [];
    multiRegion = false;
    blurEnabled;
    compositeEnabled;
    static USE_BLUR_RECT = true;
    static EDGE_LENS_REACH = 96;
    static EDGE_FOOTPRINT_SPREAD = 0.9 * 32;
    static BLUR_RECT_MIN_MARGIN = 12;
    static BLUR_RECT_MIN_SAVING = 0.95;
    static BLUR_RECT_QUANTUM = 64;
    static USE_COMPOSITE_RECT = true;
    static COMPOSITE_RECT_MIN_SAVING = 0.95;

    compositeRect() {
        if (!this.compositeEnabled)
            return null;
        if ((this._uniforms.get('debug_view') ?? 0) > 0.5)
            return null;
        const resW = this._uniforms.get('resolution_x') ?? 0;
        const resH = this._uniforms.get('resolution_y') ?? 0;
        if (!(resW >= 1) || !(resH >= 1))
            return null;
        const body = this._glassBodyUnion();
        if (!body)
            return null;
        let [x0, y0, x1, y1] = body;
        const shadowMax = Math.max(this._uniforms.get('shadow_max_radius') ?? 0, 5);
        const shadowRadius = Math.max(this._uniforms.get('shadow_radius') ?? 0, 0);
        const shadowIntensity = this._uniforms.get('shadow_intensity') ?? 0;
        const reach = !(shadowIntensity > 0)
            ? 0
            : (this.multiRegion ? Math.min(shadowRadius, 8) : Math.min(shadowRadius, shadowMax));
        const feather = Math.max(this._uniforms.get('edge_smoothing') ?? 0, 0.75);
        const m = Math.ceil(reach + feather + 2);
        x0 -= m;
        y0 -= m;
        x1 += m;
        y1 += m;
        const maxW = Math.round(resW);
        const maxH = Math.round(resH);
        const bx = Math.max(0, Math.floor(x0));
        const by = Math.max(0, Math.floor(y0));
        const bw = Math.min(maxW, Math.ceil(x1)) - bx;
        const bh = Math.min(maxH, Math.ceil(y1)) - by;
        if (!(bw >= 2) || !(bh >= 2))
            return null;
        if (bw * bh >= maxW * maxH * GlassGeometry.COMPOSITE_RECT_MIN_SAVING)
            return null;
        return [bx, by, bw, bh];
    }

    _glassBodyUnion() {
        const pad = Math.max(this._uniforms.get('padding') ?? 0, 0);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const rects = this.multiRegion ? this.regions : [this.rect];
        for (const r of rects) {
            const [rx, ry, rw, rh] = r;
            if (!(rw > 0) || !(rh > 0))
                continue;
            const ix = Math.min(pad, Math.max(rw / 2 - 1, 0));
            const iy = Math.min(pad, Math.max(rh / 2 - 1, 0));
            if (rx + ix < x0)
                x0 = rx + ix;
            if (ry + iy < y0)
                y0 = ry + iy;
            if (rx + rw - ix > x1)
                x1 = rx + rw - ix;
            if (ry + rh - iy > y1)
                y1 = ry + rh - iy;
        }
        if (!(x1 > x0) || !(y1 > y0))
            return null;
        return [x0, y0, x1, y1];
    }

    _samplingReachPx(resW, resH) {
        const chroma = Math.min(Math.max(this._uniforms.get('chroma_strength') ?? 0, 0), 1);
        const minRes = Math.max(Math.min(resW, resH), 1);
        return Math.min(0.30 * minRes, GlassGeometry.EDGE_LENS_REACH * (1 + chroma) + GlassGeometry.EDGE_FOOTPRINT_SPREAD);
    }

    blurRect() {
        if (!this.blurEnabled)
            return null;
        const resW = this._uniforms.get('resolution_x') ?? 0;
        const resH = this._uniforms.get('resolution_y') ?? 0;
        if (!(resW >= 1) || !(resH >= 1))
            return null;
        const body = this._glassBodyUnion();
        if (!body)
            return null;
        const [x0, y0, x1, y1] = body;
        const dispPx = this._samplingReachPx(resW, resH);
        const feather = Math.max(this._uniforms.get('edge_smoothing') ?? 0, 0.75);
        const extra = GlassGeometry.BLUR_RECT_MIN_MARGIN + feather + 2.5;
        const mx = Math.ceil(dispPx + extra);
        const my = Math.ceil(dispPx + extra);
        const maxW = Math.round(resW);
        const maxH = Math.round(resH);
        let bx = Math.max(0, Math.floor(x0 - mx));
        let by = Math.max(0, Math.floor(y0 - my));
        let bw = Math.min(maxW, Math.ceil(x1 + mx)) - bx;
        let bh = Math.min(maxH, Math.ceil(y1 + my)) - by;
        if (!(bw >= 2) || !(bh >= 2))
            return null;
        const q = GlassGeometry.BLUR_RECT_QUANTUM;
        bw = Math.min(maxW, Math.ceil(bw / q) * q);
        bh = Math.min(maxH, Math.ceil(bh / q) * q);
        bx = Math.max(0, Math.min(bx, maxW - bw));
        by = Math.max(0, Math.min(by, maxH - bh));
        if (bw * bh >= resW * resH * GlassGeometry.BLUR_RECT_MIN_SAVING)
            return null;
        return [bx, by, bw, bh];
    }
}

export class UniformState {
    _pipeline = null;

    get values() { return this._pendingUniforms; }

    attach(pipeline) {
        this._pipeline = pipeline;
        this._compUniforms.clear();
        this._compUniformArrays.clear();
        this._appliedUniforms.clear();
        this._appliedUniformArrays.clear();
        if (pipeline)
            this.flush();
    }

    takeDirty() {
        const changed = this._uniformsDirty;
        this._uniformsDirty = false;
        return changed;
    }

    clear() {
        this.attach(null);
        this._pendingUniforms.clear();
        this._pendingUniformArrays.clear();
        this._uniformsDirty = false;
    }

    _compUniforms = new Map();
    _compUniformArrays = new Map();
    _pendingUniforms = new Map();
    _pendingUniformArrays = new Map();
    _appliedUniforms = new Map();
    _appliedUniformArrays = new Map();
    _uniformsDirty = false;

    set(name, value) {
        if (this._pendingUniforms.get(name) === value)
            return;
        this._pendingUniforms.set(name, value);
        this._uniformsDirty = true;
        if (this._pipeline) {
            this._applyUniform(name, value);
        }
    }

    _applyUniform(name, value) {
        if (!this._pipeline)
            return;
        if (this._appliedUniforms.get(name) === value)
            return;
        let loc = this._compUniforms.get(name);
        if (loc === undefined) {
            loc = this._pipeline.get_uniform_location(name);
            this._compUniforms.set(name, loc);
        }
        this._pipeline.set_uniform_1f(loc, value);
        this._appliedUniforms.set(name, value);
    }

    flush() {
        for (const [name, value] of this._pendingUniforms) {
            this._applyUniform(name, value);
        }
        for (const [name, values] of this._pendingUniformArrays) {
            this._applyUniformArray(name, values);
        }
    }

    setArray(name, values) {
        const prev = this._pendingUniformArrays.get(name);
        if (prev && prev.length === values.length) {
            let same = true;
            for (let i = 0; i < values.length; i++) {
                if (prev[i] !== values[i]) {
                    same = false;
                    break;
                }
            }
            if (same)
                return;
        }
        this._pendingUniformArrays.set(name, values.slice());
        this._uniformsDirty = true;
        if (this._pipeline) {
            this._applyUniformArray(name, values);
        }
    }

    _applyUniformArray(name, values) {
        if (!this._pipeline)
            return;
        const applied = this._appliedUniformArrays.get(name);
        if (applied && applied.length === values.length) {
            let same = true;
            for (let i = 0; i < values.length; i++) {
                if (applied[i] !== values[i]) {
                    same = false;
                    break;
                }
            }
            if (same)
                return;
        }
        let loc = this._compUniformArrays.get(name);
        if (loc === undefined) {
            loc = this._pipeline.get_uniform_location(name);
            this._compUniformArrays.set(name, loc);
        }
        setUniformArray(this._pipeline, loc, name, values);
        this._appliedUniformArrays.set(name, values.slice());
    }
}

export class MaterialSettings {
    _settings;
    _uniforms;
    _blur;
    _setDiagnostics;
    _repaintIfDirty;
    _settingsIds = [];

    constructor(_settings, _uniforms, _blur, _setDiagnostics, _repaintIfDirty) {
        this._settings = _settings;
        this._uniforms = _uniforms;
        this._blur = _blur;
        this._setDiagnostics = _setDiagnostics;
        this._repaintIfDirty = _repaintIfDirty;
    }

    initialize() {
        this._uniforms.set('resolution_x', 0.0);
        this._uniforms.set('resolution_y', 0.0);
        this._uniforms.set('corner_radius', 60.0);
        this._uniforms.set('brightness', 1.0);
        this._uniforms.set('contrast', 1.0);
        this._uniforms.set('saturation', 1.0);
        this._uniforms.set('padding', 20.0);
        this._uniforms.set('shadow_max_radius', 180.0);
        this._uniforms.set('isDock', 0.0);
        this._uniforms.set('surface_light_enabled', 1.0);
        this._uniforms.set('corner_smoothing_enabled', 1.0);
        this._uniforms.set('outline_width', 0.0);
        this._uniforms.set('outline_r', 1.0);
        this._uniforms.set('outline_g', 1.0);
        this._uniforms.set('outline_b', 1.0);
        this._uniforms.set('dock_x', 0.0);
        this._uniforms.set('dock_y', 0.0);
        this._uniforms.set('dock_w', 0.0);
        this._uniforms.set('dock_h', 0.0);
        this._uniforms.set('multi_region_mode', 0.0);
        this._uniforms.set('region_count', 0.0);
        this._uniforms.set('tooltip_pointer_side', 0.0);
        this._uniforms.set('tooltip_pointer_size', 0.0);
        this._uniforms.set('tooltip_pointer_offset', 0.0);
        this._uniforms.set('early_exit_enabled', 1.0);
        this._uniforms.set('debug_view', 0.0);
        this._uniforms.set('blur_rect_x', 0.0);
        this._uniforms.set('blur_rect_y', 0.0);
        this._uniforms.set('blur_rect_w', 0.0);
        this._uniforms.set('blur_rect_h', 0.0);
        this._uniforms.set('blur_tex_w', 0.0);
        this._uniforms.set('blur_tex_h', 0.0);
        this._uniforms.set('edge_taps_enabled', 1.0);
        this._blur.setBlurRadius(24);
        this._uniforms.set('tint_strength', 0.0);
        this._uniforms.set('tint_r', 1.0);
        this._uniforms.set('tint_g', 1.0);
        this._uniforms.set('tint_b', 1.0);
        this._settingsIds = [];
        if (this._settings) {
            this._bindSettings();
        }
        else {
            this._uniforms.set('max_z', 92.0);
            this._uniforms.set('displacement_scale', 13.5);
            this._uniforms.set('edge_smoothing', 0.5);
            this._uniforms.set('profile_shape_n', 3.6);
            this._uniforms.set('ior', 2.45);
            this._uniforms.set('chroma_strength', 0.15);
            this._uniforms.set('corner_smoothing', 0.6);
            this._uniforms.set('highlight_backdrop_color', 1.0);
            this._uniforms.set('specular_intensity', 0.22);
            this._uniforms.set('shininess', 48.0);
            this._uniforms.set('rim_width', 2.6);
            this._uniforms.set('rim_intensity', 0.85);
            this._uniforms.set('rim_directional_power', 1.7);
            this._uniforms.set('rim_power', 3.0);
            this._uniforms.set('rim_light_color_intensity', 1.0);
            this._uniforms.set('sheen_intensity', 0.05);
            this._uniforms.set('light_angle_deg', 90.0);
            this._uniforms.set('shadow_radius', 50.0);
            this._uniforms.set('shadow_intensity', 0.22);
            this._uniforms.set('ao_intensity', 0.65);
            this._uniforms.set('ao_radius', 1.0);
            this._uniforms.set('tint_strength', 0.0);
            this._uniforms.set('tint_r', 1.0);
            this._uniforms.set('tint_g', 1.0);
            this._uniforms.set('tint_b', 1.0);
        }
    }

    clear() {
        if (this._settings)
            this._settingsIds.forEach(id => this._settings?.disconnect(id));
        this._settingsIds = [];
    }

    _bindSettings() {
        const mappings = [
            { key: 'glass-max-z', uniform: 'max_z' },
            { key: 'glass-displacement-scale', uniform: 'displacement_scale' },
            { key: 'glass-edge-smoothing', uniform: 'edge_smoothing' },
            { key: 'glass-profile-shape-n', uniform: 'profile_shape_n' },
            { key: 'glass-ior', uniform: 'ior' },
            { key: 'glass-chroma-strength', uniform: 'chroma_strength' },
            { key: 'glass-specular-intensity', uniform: 'specular_intensity' },
            { key: 'glass-shininess', uniform: 'shininess' },
            { key: 'glass-rim-width', uniform: 'rim_width' },
            { key: 'glass-rim-intensity', uniform: 'rim_intensity' },
            { key: 'glass-rim-directional-power', uniform: 'rim_directional_power' },
            { key: 'glass-rim-power', uniform: 'rim_power' },
            { key: 'glass-rim-light-color-intensity', uniform: 'rim_light_color_intensity' },
            { key: 'glass-sheen-intensity', uniform: 'sheen_intensity' },
            { key: 'glass-light-angle-deg', uniform: 'light_angle_deg' },
            { key: 'shadow-radius', uniform: 'shadow_radius' },
            { key: 'shadow-intensity', uniform: 'shadow_intensity' },
            { key: 'glass-ao-intensity', uniform: 'ao_intensity' },
            { key: 'glass-ao-radius', uniform: 'ao_radius' },
            { key: 'glass-corner-smoothing', uniform: 'corner_smoothing' },
        ];
        const settings = this._settings;
        if (!settings)
            return;
        mappings.forEach(map => {
            this._uniforms.set(map.uniform, settings.get_double(map.key));
            const id = settings.connect(`changed::${map.key}`, () => {
                this._uniforms.set(map.uniform, settings.get_double(map.key));
                this._repaintIfDirty();
            });
            this._settingsIds.push(id);
        });
        const applyBackdropHighlights = () => {
            this._uniforms.set('highlight_backdrop_color', settings.get_boolean('glass-backdrop-highlights') ? 1.0 : 0.0);
        };
        applyBackdropHighlights();
        const highlightsId = settings.connect('changed::glass-backdrop-highlights', () => {
            applyBackdropHighlights();
            this._repaintIfDirty();
        });
        this._settingsIds.push(highlightsId);
        const applyDownscale = () => {
            const factor = settings.get_int('glass-blur-downscale') >= 4 ? 4 : 2;
            this._blur.setDownscale(factor);
        };
        applyDownscale();
        const downscaleId = settings.connect('changed::glass-blur-downscale', applyDownscale);
        this._settingsIds.push(downscaleId);
        const applyBlurMethod = () => {
            const raw = settings.get_int('blur-method');
            this._blur.setBlurMethod(raw === 0 ? 0 : 1);
        };
        applyBlurMethod();
        const blurMethodId = settings.connect('changed::blur-method', applyBlurMethod);
        this._settingsIds.push(blurMethodId);
        const applyDiagFlag = () => {
            this._setDiagnostics(settings.get_boolean('glass-debug-diagnostics'));
        };
        applyDiagFlag();
        const diagId = settings.connect('changed::glass-debug-diagnostics', applyDiagFlag);
        this._settingsIds.push(diagId);
    }

    setAnimationScale(scale) {
        const settings = this._settings;
        if (!settings)
            return false;
        this._uniforms.set('displacement_scale', settings.get_double('glass-displacement-scale') * scale);
        this._uniforms.set('max_z', settings.get_double('glass-max-z') * scale);
        return true;
    }
}

export class OutlineBinding {
    _settings;
    _prefix;
    _uniforms;
    _repaintIfDirty;
    _ids = [];

    constructor(_settings, _prefix, _uniforms, _repaintIfDirty) {
        this._settings = _settings;
        this._prefix = _prefix;
        this._uniforms = _uniforms;
        this._repaintIfDirty = _repaintIfDirty;
    }

    initialize() {
        this._apply();
    }

    clear() {
        this._ids.forEach(id => this._settings.disconnect(id));
        this._ids = [];
    }

    _apply() {
        this._uniforms.set('outline_width', 0.0);
        this._uniforms.set('outline_r', 1.0);
        this._uniforms.set('outline_g', 1.0);
        this._uniforms.set('outline_b', 1.0);
    }
}
