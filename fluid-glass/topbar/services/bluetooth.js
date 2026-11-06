// SPDX-License-Identifier: GPL-2.0-or-later
//
// BluetoothService — a focused model for the standalone menu-bar Bluetooth menu.
// Manages Bluetooth adapter state, paired/connected devices, and connects/disconnects.

import 'gi://GnomeBluetooth?version=3.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeBluetooth from 'gi://GnomeBluetooth';
import GObject from 'gi://GObject';

import {_} from '../i18n.js';

const RFKILL_NAME = 'org.gnome.SettingsDaemon.Rfkill';
const RFKILL_PATH = '/org/gnome/SettingsDaemon/Rfkill';
const RFKILL_XML = `
<node><interface name="${RFKILL_NAME}">
  <property name="BluetoothAirplaneMode" type="b" access="readwrite"/>
  <property name="BluetoothHasAirplaneMode" type="b" access="read"/>
</interface></node>`;

const RfkillProxy = Gio.DBusProxy.makeProxyWrapper(RFKILL_XML);

try {
    Gio._promisify(GnomeBluetooth.Client.prototype, 'connect_service');
} catch (_e) {}

export const BluetoothService = GObject.registerClass({
    GTypeName: 'FluidGlass_BluetoothService',
    Signals: {'changed': {}},
}, class BluetoothService extends GObject.Object {
    _init() {
        console.log('[FluidGlass] Initializing BluetoothService...');
        super._init();

        this._client = null;
        this._clientSignals = [];
        this._deviceSignals = new Map();
        this._rfkill = null;
        this._rfkillId = 0;
        this._destroyed = false;

        try {
            this._client = new GnomeBluetooth.Client();
            this._clientSignals.push(
                this._client.connect('notify::default-adapter', () => {
                    this._retrackDevices();
                    this.emit('changed');
                }),
                this._client.connect('notify::default-adapter-powered', () => {
                    this.emit('changed');
                }),
                this._client.connect('notify::default-adapter-state', () => {
                    this.emit('changed');
                }),
                this._client.connect('device-added', (_c, device) => {
                    this._trackDevice(device);
                    this.emit('changed');
                }),
                this._client.connect('device-removed', (_c, device) => {
                    this._untrackDevice(device);
                    this.emit('changed');
                })
            );
            this._retrackDevices();
        } catch (e) {
            logError(e, 'lintel: create GnomeBluetooth client');
        }

        new RfkillProxy(Gio.DBus.session, RFKILL_NAME, RFKILL_PATH,
            (proxy, error) => {
                if (error || this._destroyed)
                    return;
                this._rfkill = proxy;
                this._rfkillId = proxy.connect('g-properties-changed',
                    () => this.emit('changed'));
                this.emit('changed');
            });
    }

    _trackDevice(device) {
        if (!device || this._deviceSignals.has(device))
            return;
        const ids = [
            device.connect('notify::connected', () => this.emit('changed')),
            device.connect('notify::alias', () => this.emit('changed')),
            device.connect('notify::paired', () => this.emit('changed')),
            device.connect('notify::icon', () => this.emit('changed')),
        ];
        this._deviceSignals.set(device, ids);
    }

    _untrackDevice(device) {
        const ids = this._deviceSignals.get(device);
        if (ids) {
            for (const id of ids) {
                try {
                    device.disconnect(id);
                } catch (_e) {}
            }
            this._deviceSignals.delete(device);
        }
    }

    _retrackDevices() {
        for (const [device, ids] of this._deviceSignals) {
            for (const id of ids) {
                try {
                    device.disconnect(id);
                } catch (_e) {}
            }
        }
        this._deviceSignals.clear();

        const store = this._client?.get_devices();
        if (store) {
            const count = store.get_n_items();
            for (let i = 0; i < count; i++) {
                this._trackDevice(store.get_item(i));
            }
        }
    }

    get available() {
        return Boolean(this._rfkill?.BluetoothHasAirplaneMode || this._client?.default_adapter);
    }

    get enabled() {
        if (this._rfkill && this._rfkill.BluetoothAirplaneMode)
            return false;
        return Boolean(this._client?.default_adapter_powered);
    }

    setEnabled(enabled) {
        if (this._rfkill) {
            try {
                this._rfkill.BluetoothAirplaneMode = !enabled;
            } catch (e) {
                logError(e, 'lintel: set BluetoothAirplaneMode');
            }
        }
        if (this._client) {
            try {
                this._client.default_adapter_powered = Boolean(enabled);
            } catch (e) {
                logError(e, 'lintel: set default_adapter_powered');
            }
        }
        this.emit('changed');
    }

    get devices() {
        if (!this.enabled || !this._client)
            return [];

        const store = this._client.get_devices();
        if (!store)
            return [];

        const list = [];
        const count = store.get_n_items();
        for (let i = 0; i < count; i++) {
            const dev = store.get_item(i);
            if (!dev || (!dev.paired && !dev.trusted && !dev.connected))
                continue;
            list.push({
                name: dev.alias || dev.name || _('Bluetooth Device'),
                iconName: dev.icon || 'bluetooth-active-symbolic',
                connected: Boolean(dev.connected),
                paired: Boolean(dev.paired),
                objectPath: dev.get_object_path?.() || dev.props?.proxy?.get_object_path?.(),
                rawDevice: dev,
            });
        }

        list.sort((a, b) => {
            if (a.connected !== b.connected)
                return b.connected ? 1 : -1;
            return a.name.localeCompare(b.name);
        });

        return list;
    }

    get connectedDevices() {
        return this.devices.filter(d => d.connected);
    }

    get iconName() {
        if (!this.available || !this.enabled)
            return 'bluetooth-disabled-symbolic';
        return 'bluetooth-active-symbolic';
    }

    async toggleDevice(device) {
        if (!this._client || !device)
            return false;
        const rawDev = device.rawDevice ?? device;
        const path = rawDev.get_object_path?.() || rawDev.props?.proxy?.get_object_path?.();
        if (!path)
            return false;

        const connect = !rawDev.connected;
        try {
            await this._client.connect_service(path, connect, null);
            this.emit('changed');
            return true;
        } catch (e) {
            logError(e, `lintel: toggle Bluetooth device ${rawDev.alias}`);
            return false;
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._client) {
            for (const id of this._clientSignals) {
                try {
                    this._client.disconnect(id);
                } catch (_e) {}
            }
            this._clientSignals = [];
        }
        this._retrackDevices();
        if (this._rfkill && this._rfkillId) {
            try {
                this._rfkill.disconnect(this._rfkillId);
            } catch (_e) {}
            this._rfkillId = 0;
        }
        this._rfkill = null;
        this._client = null;
    }
});
