import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/gnome-shell/extension.js');
let quickActor;
let dateActor;

class Actor {
    constructor(name) {
        this.name = name;
        this.classes = new Set();
        this.effects = new Map();
    }
    add_style_class_name(name) { this.classes.add(name); }
    remove_style_class_name(name) { this.classes.delete(name); }
    add_effect_with_name(name, effect) { this.effects.set(name, effect); }
    remove_effect_by_name(name) { this.effects.delete(name); }
}

class Settings {
    constructor(values = {}) {
        this.values = {
            'blur-enabled': true,
            'panel-blur': true,
            'popup-blur': false,
            'blur-radius': 16,
            brightness: 0.88,
            ...values,
        };
        this.handlers = new Map();
        this.nextHandler = 1;
    }
    get_boolean(key) { return Boolean(this.values[key]); }
    get_int(key) { return Number(this.values[key]); }
    get_double(key) { return Number(this.values[key]); }
    connect(name, callback) {
        const id = this.nextHandler++;
        this.handlers.set(id, { name, callback });
        return id;
    }
    disconnect(id) { this.handlers.delete(id); }
}

class InterfaceSettings extends Settings {
    get_string(key) { return this.values[key] ?? ''; }
}

class TestExtension {
    constructor() { this.settings = new Settings(); }
    getSettings() { return this.settings; }
    loadStylesheet() {}
    unloadStylesheet() { this.stylesheetUnloaded = true; }
}

class BlurEffect {
    constructor(properties) { this.properties = properties; }
}

quickActor = new Actor('quick-settings');
dateActor = new Actor('date-menu');
const panel = new Actor('panel');
panel.statusArea = {
    quickSettings: { menu: { actor: quickActor } },
    dateMenu: { menu: { actor: dateActor } },
};
const uiGroup = new Actor('ui-group');
const themeContext = {
    scale_factor: 2,
    connect() { return 77; },
    disconnect() { this.disconnected = true; },
};
const interfaceSettings = new InterfaceSettings({
    'color-scheme': 'prefer-dark',
    'gtk-theme': 'Adwaita-dark',
});
const Main = { panel, uiGroup };
const Gio = { Settings: class { constructor() { return interfaceSettings; } } };
const Shell = { BlurEffect, BlurMode: { BACKGROUND: 1 } };
const St = { ThemeContext: { get_for_stage: () => themeContext } };

let code = fs.readFileSync(sourcePath, 'utf8');
code = code.replace(/^import .*;\s*$/gm, '');
code = code.replace('export default class FluidGlassExtension', 'globalThis.FluidGlassExtension = class FluidGlassExtension');
const context = {
    Extension: TestExtension, Main, Gio, Shell, St,
    global: { stage: {} },
    log() {},
    logError(error) { throw error; },
};
vm.runInNewContext(code, context, { filename: sourcePath });

const extension = new context.FluidGlassExtension();
extension.enable();
assert.equal(panel.effects.size, 1, 'panel blur should be active by default');
assert.equal(panel.effects.get('fluid-glass-backdrop-blur').properties.radius, 32,
    'blur radius should scale with the stage scale factor');
assert.equal(quickActor.effects.size, 0, 'popup blur should be opt-in');
assert(quickActor.classes.has('fluid-glass-popup'));
assert(uiGroup.classes.has('fluid-glass-dark'));

extension.settings.values['popup-blur'] = true;
extension._refreshEffects();
assert.equal(quickActor.effects.size, 1);
assert.equal(dateActor.effects.size, 1);

const oldQuickActor = quickActor;
quickActor = new Actor('quick-settings-recreated');
panel.statusArea.quickSettings.menu.actor = quickActor;
extension._refreshEffects();
assert(!oldQuickActor.classes.has('fluid-glass-popup'),
    'replaced popup actor must not retain extension classes');
assert(quickActor.classes.has('fluid-glass-popup'));
assert.equal(quickActor.effects.size, 1);

extension.disable();
assert.equal(panel.effects.size, 0);
assert.equal(quickActor.effects.size, 0);
assert.equal(dateActor.effects.size, 0);
assert(!panel.classes.has('fluid-glass-panel'));
assert(!uiGroup.classes.has('fluid-glass-root'));
assert(!quickActor.classes.has('fluid-glass-popup'));
assert.equal(themeContext.disconnected, true);
console.log('Extension lifecycle mock test passed: blur scaling, opt-in popup effects, actor refresh and clean disable.');
