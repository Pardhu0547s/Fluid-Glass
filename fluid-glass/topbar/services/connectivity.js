// SPDX-License-Identifier: GPL-2.0-or-later
//
// ConnectivityService — network and Bluetooth state for the Control Center.
// NetworkManager is read through libnm because the first thing the popup needs
// is which hardware exists: a laptop has a Wi-Fi card to toggle, a desktop on a
// cable only an Ethernet port. Bluetooth/Airplane come from GNOME's Rfkill
// service. We only read/flip well-defined properties on existing daemons
// (no NM/BlueZ reimplementation). Signatures verified live:
//   NM     /org/freedesktop/NetworkManager    WirelessEnabled(b rw)
//   Rfkill /org/gnome/SettingsDaemon/Rfkill    AirplaneMode(b rw), HasAirplaneMode(b),
//          BluetoothAirplaneMode(b rw), BluetoothHasAirplaneMode(b)

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import NM from 'gi://NM';

const NM_NAME = 'org.freedesktop.NetworkManager';
const NM_PATH = '/org/freedesktop/NetworkManager';

const RFKILL_NAME = 'org.gnome.SettingsDaemon.Rfkill';
const RFKILL_PATH = '/org/gnome/SettingsDaemon/Rfkill';
const RFKILL_XML = `
<node><interface name="${RFKILL_NAME}">
  <property name="AirplaneMode" type="b" access="readwrite"/>
  <property name="HasAirplaneMode" type="b" access="read"/>
  <property name="BluetoothAirplaneMode" type="b" access="readwrite"/>
  <property name="BluetoothHasAirplaneMode" type="b" access="read"/>
</interface></node>`;

const RfkillProxy = Gio.DBusProxy.makeProxyWrapper(RFKILL_XML);

export const ConnectivityService = GObject.registerClass({
    Signals: {'changed': {}},
}, class ConnectivityService extends GObject.Object {
    _init() {
        super._init();
        this._client = null;
        this._clientIds = [];
        this._deviceIds = [];
        this._rfkill = null;
        this._rfkillId = 0;
        this._destroyed = false;
        this._cancellable = new Gio.Cancellable();

        NM.Client.new_async(this._cancellable, (_source, result) => {
            let client;
            try {
                client = NM.Client.new_finish(result);
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    logError(e, 'fluid-glass: create NetworkManager client');
                return; // NM absent — network tiles hidden.
            }
            if (this._destroyed) {
                client.run_dispose();
                return;
            }
            this._client = client;
            for (const signal of ['device-added', 'device-removed']) {
                this._clientIds.push(
                    client.connect(signal, () => this._devicesChanged()));
            }
            for (const property of ['nm-running', 'wireless-enabled', 'connectivity']) {
                this._clientIds.push(client.connect(`notify::${property}`,
                    () => this.emit('changed')));
            }
            this._devicesChanged();
        });

        new RfkillProxy(Gio.DBus.session, RFKILL_NAME, RFKILL_PATH,
            (proxy, error) => {
                if (error || this._destroyed)
                    return; // Rfkill absent — BT/airplane tiles hidden.
                this._rfkill = proxy;
                this._rfkillId = proxy.connect('g-properties-changed',
                    () => this.emit('changed'));
                this.emit('changed');
            });
    }

    // ---- Devices ------------------------------------------------------------

    /**
     * Every device of `type`, managed or not: an Ethernet port that NM starts
     * managing only announces it through its own `state-changed`.
     */
    _devices(type) {
        if (!this._client?.nm_running)
            return [];
        return this._client.get_devices()
            .filter(device => device.device_type === type);
    }

    _managedDevices(type) {
        return this._devices(type)
            .filter(device => device.state !== NM.DeviceState.UNMANAGED);
    }

    _devicesChanged() {
        for (const [device, id] of this._deviceIds)
            GObject.signal_handler_disconnect(device, id);
        this._deviceIds = [];
        for (const device of this._devices(NM.DeviceType.ETHERNET)) {
            this._deviceIds.push([device, device.connect('state-changed',
                () => this.emit('changed'))]);
            this._deviceIds.push([device, device.connect('notify::active-connection',
                () => this.emit('changed'))]);
            this._deviceIds.push([device, device.connect('notify::ip4-config',
                () => this.emit('changed'))]);
        }
        for (const device of this._devices(NM.DeviceType.MODEM)) {
            this._deviceIds.push([device, device.connect('state-changed',
                () => this.emit('changed'))]);
            this._deviceIds.push([device, device.connect('notify::active-connection',
                () => this.emit('changed'))]);
            this._deviceIds.push([device, device.connect('notify::ip4-config',
                () => this.emit('changed'))]);
        }
        for (const device of this._devices(NM.DeviceType.WIFI)) {
            this._deviceIds.push([device, device.connect('state-changed',
                () => this.emit('changed'))]);
            this._deviceIds.push([device, device.connect('notify::active-access-point',
                () => this.emit('changed'))]);
        }
        this.emit('changed');
    }

    // ---- Wi-Fi --------------------------------------------------------------

    /** A Wi-Fi card exists; NetworkManager running is not enough. */
    get wifiAvailable() {
        return this._managedDevices(NM.DeviceType.WIFI).length > 0;
    }

    get wifiEnabled() {
        return this._client?.wireless_enabled ?? false;
    }

    get wifiSsid() {
        for (const device of this._managedDevices(NM.DeviceType.WIFI)) {
            const ap = device.active_access_point;
            const ssid = ap?.get_ssid?.();
            if (!ssid)
                continue;
            try {
                const text = NM.utils_ssid_to_utf8(ssid.get_data());
                if (text)
                    return text;
            } catch (_e) {}
        }
        return '';
    }

    setWifi(on) {
        this._setProp(Gio.DBus.system, NM_NAME, NM_PATH, NM_NAME,
            'WirelessEnabled', GLibBool(on));
    }

    // ---- Wired / LAN / USB Tethering ---------------------------------------

    _isPhysicalNetworkDevice(device) {
        if (!device || device.state === NM.DeviceState.UNMANAGED)
            return false;
        const type = device.device_type;
        if (type !== NM.DeviceType.ETHERNET && type !== NM.DeviceType.MODEM)
            return false;
        const udi = device.get_udi?.() ?? '';
        if (udi.startsWith('/sys/devices/virtual/'))
            return false;
        return true;
    }

    _classifyWiredDevice(device) {
        if (device.device_type === NM.DeviceType.MODEM)
            return 'modem';
        const driver = (device.get_driver?.() ?? '').toLowerCase();
        const iface = (device.get_iface?.() ?? '').toLowerCase();
        const udi = (device.get_udi?.() ?? '').toLowerCase();
        const product = (device.get_product?.() ?? '').toLowerCase();
        if (driver === 'rndis_host' || driver === 'ipheth' ||
            driver === 'cdc_eem' || driver === 'zaurus' ||
            driver === 'qmi_wwan' || driver === 'cdc_mbim' ||
            driver === 'huawei_cdc_ncm' || /^usb\d+/.test(iface))
            return 'usb';
        if (udi.includes('/usb') && (driver === 'cdc_ncm' || driver === 'cdc_ether') &&
            !/ethernet|gigabit|lan|dock|r815|ax88|realtek|asix/.test(product))
            return 'usb';
        return 'wired';
    }

    get wiredAvailable() {
        return this._managedDevices(NM.DeviceType.ETHERNET).length > 0;
    }

    get connectivityState() {
        return this._client?.get_connectivity?.() ?? NM.ConnectivityState.UNKNOWN;
    }

    get wiredConnections() {
        if (!this._client?.nm_running)
            return [];
        const list = [];
        for (const device of this._client.get_devices()) {
            if (!this._isPhysicalNetworkDevice(device))
                continue;
            const state = device.state;
            const connected = state === NM.DeviceState.ACTIVATED;
            const connecting = state > NM.DeviceState.DISCONNECTED &&
                state < NM.DeviceState.ACTIVATED;
            const pluggedIn = device.device_type === NM.DeviceType.ETHERNET &&
                Boolean(device.carrier);
            if (!connected && !connecting && !pluggedIn)
                continue;
            const kind = this._classifyWiredDevice(device);
            const iface = device.get_iface?.() ?? '';
            const product = (device.get_product?.() ?? '').trim();
            const ac = device.get_active_connection?.() ?? null;
            const connectionName = ac?.get_id?.() ?? '';
            let ip4 = '';
            try {
                const cfg = device.get_ip4_config?.();
                const addrs = cfg?.get_addresses?.() ?? [];
                ip4 = addrs[0]?.get_address?.() ?? '';
            } catch (_e) {}
            list.push({
                device,
                iface,
                kind,
                state,
                connected,
                connecting,
                pluggedIn,
                product,
                connectionName,
                ip4,
                activeConnection: ac,
            });
        }
        return list;
    }

    deactivateDeviceConnection(device) {
        const ac = device?.get_active_connection?.();
        if (!this._client || !ac)
            return false;
        this._client.deactivate_connection_async(ac, this._cancellable, (client, res) => {
            try {
                client.deactivate_connection_finish(res);
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    logError(e, 'fluid-glass: deactivate wired connection');
            }
        });
        return true;
    }

    activateDeviceConnection(device) {
        if (!this._client || !device)
            return false;
        const available = device.get_available_connections?.() ?? [];
        const conn = available[0] ?? null;
        if (!conn)
            return false;
        this._client.activate_connection_async(conn, device, null, this._cancellable, (client, res) => {
            try {
                client.activate_connection_finish(res);
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    logError(e, 'fluid-glass: activate wired connection');
            }
        });
        return true;
    }

    /**
     * The best state across all Ethernet ports.
     *
     * @returns {'connected'|'connecting'|'unplugged'|'disconnected'}
     */
    get wiredState() {
        const devices = this._managedDevices(NM.DeviceType.ETHERNET);
        const states = devices.map(device => device.state);
        if (states.includes(NM.DeviceState.ACTIVATED))
            return 'connected';
        if (states.some(state => state > NM.DeviceState.DISCONNECTED &&
            state < NM.DeviceState.ACTIVATED))
            return 'connecting';
        if (devices.length && devices.every(device => !device.carrier))
            return 'unplugged';
        return 'disconnected';
    }

    // ---- Bluetooth ----------------------------------------------------------

    /** False on a machine without a Bluetooth adapter. */
    get bluetoothAvailable() {
        return this._rfkill?.BluetoothHasAirplaneMode ?? false;
    }

    get bluetoothEnabled() {
        // "airplane mode for bluetooth" is the inverse of "bluetooth on".
        return this._rfkill ? !this._rfkill.BluetoothAirplaneMode : false;
    }

    setBluetooth(on) {
        this._setProp(Gio.DBus.session, RFKILL_NAME, RFKILL_PATH, RFKILL_NAME,
            'BluetoothAirplaneMode', GLibBool(!on));
    }

    // ---- Airplane -----------------------------------------------------------

    get airplaneAvailable() {
        return this._rfkill?.HasAirplaneMode ?? false;
    }

    get airplaneEnabled() {
        return this._rfkill?.AirplaneMode ?? false;
    }

    setAirplane(on) {
        this._setProp(Gio.DBus.session, RFKILL_NAME, RFKILL_PATH, RFKILL_NAME,
            'AirplaneMode', GLibBool(on));
    }

    // ---- helpers ------------------------------------------------------------

    _setProp(bus, name, path, iface, prop, variant) {
        bus.call(name, path, 'org.freedesktop.DBus.Properties', 'Set',
            new GLib.Variant('(ssv)', [iface, prop, variant]),
            null, Gio.DBusCallFlags.NONE, -1, null,
            (src, res) => {
                try {
                    src.call_finish(res);
                } catch (e) {
                    logError(e, `fluid-glass: set ${prop}`);
                }
            });
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        for (const [device, id] of this._deviceIds)
            GObject.signal_handler_disconnect(device, id);
        this._deviceIds = [];
        for (const id of this._clientIds)
            this._client?.disconnect(id);
        this._clientIds = [];
        this._client?.run_dispose();
        this._client = null;
        if (this._rfkillId && this._rfkill)
            this._rfkill.disconnect(this._rfkillId);
        this._rfkill = null;
    }
});

function GLibBool(v) {
    return GLib.Variant.new_boolean(!!v);
}
