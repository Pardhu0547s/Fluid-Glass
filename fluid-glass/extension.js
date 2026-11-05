import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';

import {PanelController} from './topbar/panelController.js';
import {GlassEngine} from './glassEngine.js';
import Dash2DockLiteExt from './dock/extension.js';
import {initGlassResources} from './glassEffect.js';

class DockSubsystem extends Dash2DockLiteExt {
    constructor(parent) {
        super(parent.metadata);
        this._parent = parent;
    }

    getSettings(schemaId = 'org.gnome.shell.extensions.dash2dock-lite') {
        return this._parent.getSettings(schemaId);
    }
}

export default class FluidGlassExtension extends Extension {
    enable() {
        console.log('[FluidGlass] Enabling Unified Fluid Glass Suite...');

        this._masterSettings = this.getSettings('org.gnome.shell.extensions.fluid-glass');
        this._topbarSettings = this.getSettings('org.gnome.shell.extensions.lintel');
        this._glassSettings = this.getSettings('org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com');
        this._dockSettings = this.getSettings('org.gnome.shell.extensions.dash2dock-lite');

        const extensionPath = this.dir.get_path();

        // 1. Topbar & Tahoe Control Center Subsystem (Lintel)
        if (this._masterSettings.get_boolean('enable-topbar')) {
            try {
                const topbarAdapter = {
                    dir: this.dir,
                    path: extensionPath,
                    uuid: this.uuid,
                    metadata: this.metadata,
                    getSettings: (schemaId = 'org.gnome.shell.extensions.lintel') => this.getSettings(schemaId),
                    openPreferences: () => this.openPreferences(),
                };

                this._topbar = new PanelController(topbarAdapter);
                this._topbar.enable();
                console.log('[FluidGlass] Topbar & Tahoe Control Center enabled');
            } catch (err) {
                console.error('[FluidGlass] Failed to initialize Topbar:', err);
            }
        }

        // 2. Liquid Glass GLSL Shader Engine Subsystem
        if (this._masterSettings.get_boolean('enable-glass-shaders')) {
            try {
                this._glass = new GlassEngine(extensionPath, this._glassSettings, () => this.openPreferences());
                this._glass.enable();
                initGlassResources(extensionPath, this._glassSettings, this._glass?._logger);
                console.log('[FluidGlass] GLSL Glass Shader engine enabled');
            } catch (err) {
                console.error('[FluidGlass] Failed to initialize Glass Engine:', err);
            }
        }

        // 3. Fluid Animated Dock Subsystem
        if (this._masterSettings.get_boolean('enable-dock')) {
            try {
                this._dock = new DockSubsystem(this);
                this._dock.enable();
                console.log('[FluidGlass] Dock subsystem enabled');
            } catch (err) {
                console.error('[FluidGlass] Failed to initialize Dock:', err);
            }
        }

        // Master settings dynamic reaction
        this._settingsSignals = [];
        this._settingsSignals.push(
            this._masterSettings.connect('changed::enable-topbar', () => this._syncTopbarState()),
            this._masterSettings.connect('changed::enable-glass-shaders', () => this._syncGlassState()),
            this._masterSettings.connect('changed::enable-dock', () => this._syncDockState())
        );

        console.log('[FluidGlass] All subsystems initialized successfully.');
    }

    _syncDockState() {
        const want = this._masterSettings.get_boolean('enable-dock');
        if (want && !this._dock) {
            this._dock = new DockSubsystem(this);
            this._dock.enable();
        } else if (!want && this._dock) {
            this._dock.disable();
            this._dock = null;
        }
    }

    _syncGlassState() {
        const want = this._masterSettings.get_boolean('enable-glass-shaders');
        const extensionPath = this.dir.get_path();
        if (want && !this._glass) {
            this._glass = new GlassEngine(extensionPath, this._glassSettings, () => this.openPreferences());
            this._glass.enable();
        } else if (!want && this._glass) {
            this._glass.disable();
            this._glass = null;
        }
    }

    _syncTopbarState() {
        const want = this._masterSettings.get_boolean('enable-topbar');
        const extensionPath = this.dir.get_path();
        if (want && !this._topbar) {
            const topbarAdapter = {
                dir: this.dir,
                path: extensionPath,
                uuid: this.uuid,
                metadata: this.metadata,
                getSettings: (schemaId = 'org.gnome.shell.extensions.lintel') => this.getSettings(schemaId),
                openPreferences: () => this.openPreferences(),
            };
            this._topbar = new PanelController(topbarAdapter);
            this._topbar.enable();
        } else if (!want && this._topbar) {
            this._topbar.destroy();
            this._topbar = null;
        }
    }

    disable() {
        console.log('[FluidGlass] Disabling Unified Fluid Glass Suite...');

        if (this._settingsSignals) {
            for (const sig of this._settingsSignals) {
                this._masterSettings.disconnect(sig);
            }
            this._settingsSignals = [];
        }

        // Disable in exact reverse order: Dock -> Glass -> Topbar
        if (this._dock) {
            try {
                this._dock.disable();
            } catch (err) {
                console.error('[FluidGlass] Error disabling dock:', err);
            }
            this._dock = null;
        }

        if (this._glass) {
            try {
                this._glass.disable();
            } catch (err) {
                console.error('[FluidGlass] Error disabling glass engine:', err);
            }
            this._glass = null;
        }

        if (this._topbar) {
            try {
                this._topbar.destroy();
            } catch (err) {
                console.error('[FluidGlass] Error destroying topbar:', err);
            }
            this._topbar = null;
        }

        this._masterSettings = null;
        this._topbarSettings = null;
        this._glassSettings = null;
        this._dockSettings = null;

        console.log('[FluidGlass] Disabled cleanly.');
    }
}
