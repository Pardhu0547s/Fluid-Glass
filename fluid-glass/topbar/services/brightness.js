// SPDX-License-Identifier: GPL-2.0-or-later
//
// BrightnessService — screen backlight.
//   1) Main.brightnessManager (GNOME 47+)
//   2) org.gnome.SettingsDaemon.Power.Screen (Brightness i, 0-100) when present.
//   3) otherwise `brightnessctl` (verified: `brightnessctl -m -c backlight` →
//      "amdgpu_bl1,backlight,62258,95%,65535", set via `brightnessctl set N%`).
// `available` is false only when none works (e.g. a desktop with no backlight).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const NAME = 'org.gnome.SettingsDaemon.Power';
const PATH = '/org/gnome/SettingsDaemon/Power';
const IFACE = 'org.gnome.SettingsDaemon.Power.Screen';
const XML = `
<node><interface name="${IFACE}">
  <property name="Brightness" type="i" access="readwrite"/>
</interface></node>`;

const Proxy = Gio.DBusProxy.makeProxyWrapper(XML);

export const BrightnessService = GObject.registerClass({
    GTypeName: 'FluidGlass_BrightnessService',
    Signals: {'changed': {}},
}, class BrightnessService extends GObject.Object {
    _init() {
        super._init();
        this._proxy = null;
        this._propsId = 0;
        this._manager = Main.brightnessManager ?? null;
        this._managerChangedId = 0;
        this._scaleNotifyId = 0;
        this._currentScale = null;

        if (this._manager) {
            try {
                this._managerChangedId = this._manager.connect('changed', () => {
                    this._bindScale();
                    this.emit('changed');
                });
                this._bindScale();
            } catch (e) {
                logError(e, 'lintel: BrightnessService Main.brightnessManager');
            }
        }

        this._ctl = GLib.find_program_in_path('brightnessctl');
        this._ctlLevel = this._ctlGet(); // null if no backlight

        // Fallback for older GNOME SettingsDaemon Power
        if (!this.available) {
            try {
                new Proxy(Gio.DBus.session, NAME, PATH, (proxy, error) => {
                    if (error)
                        return;
                    if ((proxy.Brightness ?? -1) < 0)
                        return; // no D-Bus backlight; keep brightnessctl path
                    this._proxy = proxy;
                    this._propsId = proxy.connect(
                        'g-properties-changed', () => this.emit('changed'));
                    this.emit('changed');
                });
            } catch (_e) {
                // ignore — fall back to brightnessctl
            }
        }
    }

    _bindScale() {
        if (!this._manager)
            return;
        const scale = this._manager.globalScale ?? (this._manager.scales?.[0] ?? null);
        if (scale === this._currentScale)
            return;
        if (this._currentScale && this._scaleNotifyId) {
            this._currentScale.disconnect(this._scaleNotifyId);
            this._scaleNotifyId = 0;
        }
        this._currentScale = scale;
        if (this._currentScale) {
            this._scaleNotifyId = this._currentScale.connect('notify::value', () => {
                this.emit('changed');
            });
        }
    }

    get available() {
        if (this._manager) {
            if (this._manager.globalScale != null)
                return true;
            if (this._manager.scales && this._manager.scales.length > 0)
                return true;
        }
        if (this._proxy && (this._proxy.Brightness ?? -1) >= 0)
            return true;
        return this._ctl != null && this._ctlLevel != null;
    }

    get level() {
        if (this._manager) {
            if (this._manager.globalScale)
                return Math.max(0, Math.min(1, this._manager.globalScale.value));
            if (this._manager.scales && this._manager.scales.length > 0)
                return Math.max(0, Math.min(1, this._manager.scales[0].value));
        }
        if (this._proxy && (this._proxy.Brightness ?? -1) >= 0)
            return Math.max(0, this._proxy.Brightness) / 100;
        return this._ctlLevel ?? 0;
    }

    setLevel(fraction) {
        const val = Math.max(0.01, Math.min(1.0, fraction));
        if (this._manager) {
            if (this._manager.globalScale) {
                this._manager.globalScale.value = val;
                return;
            }
            if (this._manager.scales && this._manager.scales.length > 0) {
                for (const s of this._manager.scales)
                    s.value = val;
                return;
            }
        }
        const pct = Math.round(val * 100);
        if (this._proxy && (this._proxy.Brightness ?? -1) >= 0) {
            Gio.DBus.session.call(NAME, PATH,
                'org.freedesktop.DBus.Properties', 'Set',
                new GLib.Variant('(ssv)',
                    [IFACE, 'Brightness', GLib.Variant.new_int32(pct)]),
                null, Gio.DBusCallFlags.NONE, -1, null,
                (src, res) => {
                    try {
                        src.call_finish(res);
                    } catch (e) {
                        logError(e, 'lintel: set Brightness (dbus)');
                    }
                });
            return;
        }
        if (this._ctl) {
            try {
                GLib.spawn_command_line_async(
                    `brightnessctl -c backlight set ${pct}%`);
                this._ctlLevel = pct / 100;
            } catch (e) {
                logError(e, 'lintel: brightnessctl set');
            }
        }
    }

    /** Re-read the brightnessctl value or sync scale (no change signal from the CLI). */
    refresh() {
        if (this._manager) {
            this._bindScale();
            return;
        }
        if (this._proxy)
            return;
        const v = this._ctlGet();
        if (v != null && v !== this._ctlLevel) {
            this._ctlLevel = v;
            this.emit('changed');
        } else if (v != null) {
            this._ctlLevel = v;
        }
    }

    _ctlGet() {
        if (!this._ctl)
            return null;
        try {
            const [ok, out] = GLib.spawn_command_line_sync(
                'brightnessctl -m -c backlight');
            if (!ok || !out)
                return null;
            const text = new TextDecoder().decode(out).trim();
            const line = text.split('\n').filter(l => l.length).pop();
            if (!line)
                return null;
            const pct = parseInt(line.split(',')[3], 10); // "95%" → 95
            return Number.isFinite(pct) ? pct / 100 : null;
        } catch (_e) {
            return null;
        }
    }

    destroy() {
        if (this._currentScale && this._scaleNotifyId) {
            this._currentScale.disconnect(this._scaleNotifyId);
            this._scaleNotifyId = 0;
        }
        this._currentScale = null;
        if (this._manager && this._managerChangedId) {
            this._manager.disconnect(this._managerChangedId);
            this._managerChangedId = 0;
        }
        this._manager = null;
        if (this._propsId && this._proxy)
            this._proxy.disconnect(this._propsId);
        this._proxy = null;
    }
});
