import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {_} from '../i18n.js';
import {WindowTracker} from '../services/windowTracker.js';

export const ActiveApp = GObject.registerClass({
    GTypeName: 'FluidGlass_ActiveApp',
}, class ActiveApp extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('Active Application'), true );

        this._extension = extension;

        this.reactive = false;
        this.can_focus = false;
        this.track_hover = false;

        this._label = new St.Label({
            style_class: 'fluid-glass-active-app',
            y_align: Clutter.ActorAlign.CENTER,
            text: '',
        });
        this.add_child(this._label);

        this._tracker = new WindowTracker();
        this._trackerId = this._tracker.connect(
            'app-changed', () => this._sync());
        this._tracker.start();
        this._sync();
    }

    _sync() {
        const app = this._tracker?.focusApp ?? null;
        const name = app?.get_name() ?? '';
        const shown = name || this._emptyLabel();

        this._label.text = shown;
        this.visible = shown.length > 0;
    }

    _emptyLabel() {
        try {
            const settings = this._extension?.getSettings?.();
            if (!settings)
                return _('Desktop');
            const label = settings.get_string('empty-app-label');
            return settings.get_user_value('empty-app-label') === null &&
                label === 'Desktop' ? _('Desktop') : label;
        } catch (_e) {
            return _('Desktop');
        }
    }

    destroy() {
        if (this._trackerId) {
            this._tracker.disconnect(this._trackerId);
            this._trackerId = 0;
        }
        this._tracker?.destroy();
        this._tracker = null;
        this._label = null;
        this._extension = null;

        super.destroy();
    }
});
