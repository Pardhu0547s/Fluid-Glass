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
        this._destroyed = false;
        this._ctlInFlight = false;
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
                logError(e, 'fluid-glass: BrightnessService Main.brightnessManager');
            }
        }

        this._ctl = GLib.find_program_in_path('brightnessctl');
        this._ctlLevel = null;

        if (!this.available) {
            if (this._ctl)
                this._ctlGetAsync();
            try {
                new Proxy(Gio.DBus.session, NAME, PATH, (proxy, error) => {
                    if (error || this._destroyed)
                        return;
                    if ((proxy.Brightness ?? -1) < 0)
                        return;
                    this._proxy = proxy;
                    this._propsId = proxy.connect(
                        'g-properties-changed', () => this.emit('changed'));
                    this.emit('changed');
                });
            } catch (_e) {
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
                        logError(e, 'fluid-glass: set Brightness (dbus)');
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
                logError(e, 'fluid-glass: brightnessctl set');
            }
        }
    }

    refresh() {
        if (this._manager) {
            this._bindScale();
            return;
        }
        if (this._proxy)
            return;
        this._ctlGetAsync();
    }

    _ctlGetAsync() {
        if (!this._ctl || this._ctlInFlight || this._destroyed)
            return;
        this._ctlInFlight = true;
        try {
            const proc = Gio.Subprocess.new(
                [this._ctl, '-m', '-c', 'backlight'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, null, (p, res) => {
                this._ctlInFlight = false;
                if (this._destroyed)
                    return;
                try {
                    const [ok, stdout] = p.communicate_utf8_finish(res);
                    if (!ok || !stdout)
                        return;
                    const line = stdout.trim().split('\n').filter(l => l.length).pop();
                    if (!line)
                        return;
                    const pct = parseInt(line.split(',')[3], 10);
                    if (!Number.isFinite(pct))
                        return;
                    const val = pct / 100;
                    if (val !== this._ctlLevel) {
                        this._ctlLevel = val;
                        this.emit('changed');
                    }
                } catch (_e) {
                }
            });
        } catch (_e) {
            this._ctlInFlight = false;
        }
    }

    destroy() {
        this._destroyed = true;
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
