import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/gnome-shell/extension.js');
let quickActor;
let dateActor;
let screenshotOpened = 0;

class Actor {
    constructor(name) {
        this.name = name;
        this.classes = new Set();
        this.effects = new Map();
        this.children = [];
        this.parent = null;
        this.handlers = new Map();
        this.nextHandler = 1;
    }
    add_style_class_name(name) { this.classes.add(name); }
    remove_style_class_name(name) { this.classes.delete(name); }
    add_effect_with_name(name, effect) { this.effects.set(name, effect); }
    remove_effect_by_name(name) { this.effects.delete(name); }
    insert_child_at_index(child, index) {
        if (child.parent) child.parent.remove_child(child);
        this.children.splice(index, 0, child);
        child.parent = this;
    }
    add_child(child) { this.insert_child_at_index(child, this.children.length); }
    remove_child(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parent = null;
    }
    connect(signal, callback) {
        const id = this.nextHandler++;
        this.handlers.set(id, { signal, callback });
        return id;
    }
    emit(signal) {
        for (const { signal: name, callback } of this.handlers.values())
            if (name === signal) callback(this);
    }
    destroy() {
        if (this.parent) this.parent.remove_child(this);
        this.destroyed = true;
    }
}

class QuickSettingsItem extends Actor {
    constructor(properties) {
        super('quick-settings-item');
        this.properties = properties;
    }
    click() { this.emit('clicked'); }
}

class Settings {
    constructor(values = {}) {
        this.values = {
            'blur-enabled': true,
            'panel-blur': true,
            'quick-settings-blur': true,
            'calendar-blur': false,
            'popup-blur': false,
            'screenshot-button': true,
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

quickActor = new Actor('quick-settings');
dateActor = new Actor('date-menu');
const actions = new Actor('quick-settings-actions');
const panel = new Actor('panel');
panel.statusArea = {
    quickSettings: {
        menu: { actor: quickActor },
        _system: { _indicator: { child: actions } },
    },
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
const Main = { panel, uiGroup, screenshotUI: { open() { screenshotOpened++; } } };
const Gio = { Settings: class { constructor() { return interfaceSettings; } } };
const Shell = { BlurEffect: class { constructor(properties) { this.properties = properties; } }, BlurMode: { BACKGROUND: 1 } };
const St = { ThemeContext: { get_for_stage: () => themeContext } };
const QuickSettings = { QuickSettingsItem };

let code = fs.readFileSync(sourcePath, 'utf8');
code = code.replace(/^import .*;\s*$/gm, '');
code = code.replace('export default class FluidGlassExtension', 'globalThis.FluidGlassExtension = class FluidGlassExtension');
const context = {
    Extension: TestExtension, Main, Gio, Shell, St, QuickSettings,
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
assert.equal(quickActor.effects.size, 1, 'Quick Settings backdrop blur should be enabled by default');
assert.equal(dateActor.effects.size, 0, 'calendar blur should remain opt-in');
assert(quickActor.classes.has('fluid-glass-popup'));
assert(quickActor.classes.has('fluid-glass-quick-settings'));
assert(uiGroup.classes.has('fluid-glass-dark'));
assert.equal(actions.children.length, 1, 'screenshot shortcut should be added to system actions');
actions.children[0].click();
assert.equal(screenshotOpened, 1, 'screenshot shortcut should open the native GNOME screenshot UI');

extension.settings.values['calendar-blur'] = true;
extension._refreshEffects();
assert.equal(dateActor.effects.size, 1, 'calendar blur should be configurable independently');

const oldQuickActor = quickActor;
quickActor = new Actor('quick-settings-recreated');
panel.statusArea.quickSettings.menu.actor = quickActor;
extension._refreshEffects();
assert(!oldQuickActor.classes.has('fluid-glass-popup'),
    'replaced popup actor must not retain extension classes');
assert(quickActor.classes.has('fluid-glass-popup'));
assert.equal(quickActor.effects.size, 1);

extension.settings.values['screenshot-button'] = false;
extension._refreshEffects();
assert.equal(actions.children.length, 0, 'disabling screenshot shortcut should remove its action actor');
extension.settings.values['screenshot-button'] = true;
extension._refreshEffects();
assert.equal(actions.children.length, 1, 're-enabling screenshot shortcut should add it once');

extension.disable();
assert.equal(panel.effects.size, 0);
assert.equal(quickActor.effects.size, 0);
assert.equal(dateActor.effects.size, 0);
assert.equal(actions.children.length, 0, 'disable should remove the owned screenshot action');
assert(!panel.classes.has('fluid-glass-panel'));
assert(!uiGroup.classes.has('fluid-glass-root'));
assert(!quickActor.classes.has('fluid-glass-popup'));
assert.equal(themeContext.disconnected, true);
console.log('Extension lifecycle mock passed: native screenshot action, independent popup blur, scale-aware blur, actor refresh and clean disable.');
