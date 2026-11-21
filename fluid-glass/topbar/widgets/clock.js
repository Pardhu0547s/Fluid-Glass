import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {PanelAdapter} from '../compat/panelAdapter.js';

const OUR_KEYS = [
    'clock-show-weekday',
    'clock-date-mode',
    'clock-show-ampm',
    'clock-show-seconds',
];

const NARROW_NBSP = '\u202f';

function localeDayFirst() {
    try {
        const probe = GLib.DateTime.new_local(2000, 1, 2, 12, 0, 0);
        const text = probe.format('%x');
        const day = text.search(/\b0?2\b/);
        const month = text.search(/\b0?1\b/);
        if (day < 0 || month < 0)
            return false;
        return day < month;
    } catch (_e) {
        return false;
    }
}

export class FluidGlassClock {
    constructor(extension) {
        this._extension = extension;
        this._label = null;
        this._nativeLabel = null;
        this._timerId = 0;
        this._wallClock = null;
        this._wallClockId = 0;
        this._showSeconds = false;
        this._lastPrimaryText = null;
        this._settings = null;
        this._settingsIds = [];
        this._desktop = null;
        this._desktopId = 0;
        this._format = '%H:%M';
        this._datelessFormat = '%H:%M';
        this._dateMode = 'when-space-allows';
        this._dayFirst = localeDayFirst();
    }

    get active() {
        return this._label != null;
    }

    enable() {
        if (this._label)
            return;

        const dateMenu = PanelAdapter.dateMenu;
        const native = dateMenu?._clockDisplay;
        const box = native?.get_parent();
        if (!native || !box)
            return;

        this._wallClock = dateMenu?._clock ?? null;
        this._nativeLabel = native;
        this._label = new St.Label({
            style_class: 'clock fluid-glass-clock',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const idx = box.get_children().indexOf(native);
        box.insert_child_at_index(this._label, idx);
        native.hide();

        try {
            this._settings = this._extension?.getSettings?.() ?? null;
        } catch (_e) {
            this._settings = null;
        }
        for (const key of OUR_KEYS) {
            if (!this._settings)
                break;
            this._settingsIds.push(
                this._settings.connect(`changed::${key}`, () => this._rebuild()));
        }

        this._desktop = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._desktopId = this._desktop.connect(
            'changed::clock-format', () => this._rebuild());

        this._rebuild();
    }

    _stopTicker() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
        if (this._wallClock && this._wallClockId) {
            this._wallClock.disconnect(this._wallClockId);
            this._wallClockId = 0;
        }
    }

    _startTicker() {
        this._stopTicker();
        if (this._showSeconds) {
            this._timerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, 1, () => {
                    this._tick(false);
                    return GLib.SOURCE_CONTINUE;
                });
            return;
        }
        if (this._wallClock) {
            this._wallClockId = this._wallClock.connect('notify::clock', () => {
                this._tick(false);
            });
            return;
        }
        const scheduleMinute = () => {
            const now = GLib.DateTime.new_now_local();
            const delay = Math.max(1, 60 - now.get_second());
            this._timerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, delay, () => {
                    this._timerId = 0;
                    this._tick(false);
                    if (this._label)
                        scheduleMinute();
                    return GLib.SOURCE_REMOVE;
                });
        };
        scheduleMinute();
    }

    _rebuild() {
        this._dateMode = this._dateModeSetting();
        try {
            this._showSeconds = this._settings
                ? this._settings.get_boolean('clock-show-seconds')
                : false;
        } catch (_e) {
            this._showSeconds = false;
        }
        this._format = this._buildFormat(this._dateMode !== 'never');
        this._datelessFormat = this._dateMode === 'when-space-allows'
            ? this._buildFormat(false) : null;
        this._lastPrimaryText = null;
        this._tick(true);
        this._startTicker();
    }

    _dateModeSetting() {
        try {
            return this._settings
                ? this._settings.get_string('clock-date-mode')
                : 'when-space-allows';
        } catch (_e) {
            return 'when-space-allows';
        }
    }

    _buildFormat(withDate) {
        const bool = (key, fallback) => {
            try {
                return this._settings ? this._settings.get_boolean(key) : fallback;
            } catch (_e) {
                return fallback;
            }
        };
        const weekday = bool('clock-show-weekday', true);
        const date = withDate;
        const seconds = bool('clock-show-seconds', false);
        const ampm = bool('clock-show-ampm', true);

        let is24 = true;
        try {
            is24 = this._desktop.get_string('clock-format') !== '12h';
        } catch (_e) {
            is24 = true;
        }

        const left = [];
        if (weekday)
            left.push('%a');
        if (date)
            left.push(this._dayFirst ? '%-d %b' : '%b %-d');

        let time = is24 ? '%H:%M' : '%-I:%M';
        if (seconds)
            time = is24 ? '%H:%M:%S' : '%-I:%M:%S';
        if (!is24 && ampm)
            time += `${NARROW_NBSP}%p`;

        const prefix = left.join(' ');
        return prefix ? `${prefix}  ${time}` : time;
    }

    _tick(force = false) {
        if (!this._label)
            return;
        const now = GLib.DateTime.new_now_local();
        const primary = now.format(this._format) ??
            now.format('%H:%M') ?? '';
        if (!force && primary === this._lastPrimaryText)
            return;
        this._lastPrimaryText = primary;
        this._label.text = primary;

        if (!this._datelessFormat || !this._panelOverflows())
            return;
        this._label.text = now.format(this._datelessFormat) ??
            now.format('%H:%M') ?? '';
    }

    _panelOverflows() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return false;
        let natural = 0;
        for (const box of PanelAdapter.boxes) {
            try {
                natural += box.get_preferred_width(-1)[1];
            } catch (_e) {
                return false;
            }
        }
        return natural > monitor.width;
    }

    destroy() {
        this._stopTicker();
        this._wallClock = null;
        this._lastPrimaryText = null;
        for (const id of this._settingsIds)
            this._settings?.disconnect(id);
        this._settingsIds = [];
        if (this._desktopId && this._desktop) {
            this._desktop.disconnect(this._desktopId);
            this._desktopId = 0;
        }
        this._desktop = null;
        this._settings = null;

        if (this._label) {
            this._label.destroy();
            this._label = null;
        }
        if (this._nativeLabel) {
            try {
                this._nativeLabel.show();
            } catch (_e) {
            }
            this._nativeLabel = null;
        }
        this._extension = null;
    }
}
