// SPDX-License-Identifier: GPL-2.0-or-later
//
// Independent menu-bar Bluetooth status item, matching Tahoe's status-menu model:
// its own panel hit target, checked/open state, popup anchor and device list.

import Clutter from 'gi://Clutter';
import GioUnix from 'gi://GioUnix';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {_} from '../i18n.js';
import {BluetoothService} from '../services/bluetooth.js';
import {styleStatusMenu} from './statusMenu.js';

const MAX_VISIBLE_DEVICES = 10;

export const LintelBluetoothMenu = GObject.registerClass({
    GTypeName: 'FluidGlass_LintelBluetoothMenu',
}, class LintelBluetoothMenu extends PanelMenu.Button {
    _init() {
        console.log('[FluidGlass] Initializing LintelBluetoothMenu...');
        super._init(0.5, _('Bluetooth'), false);
        this.add_style_class_name('lintel-status-button');

        this._bluetooth = new BluetoothService();
        this._bluetoothChangedId = 0;
        this._openStateId = 0;
        this._syncing = false;

        this._panelIcon = new St.Icon({
            style_class: 'system-status-icon',
            icon_name: 'bluetooth-active-symbolic',
        });
        this.add_child(this._panelIcon);

        styleStatusMenu(this.menu, 'lintel-bluetooth-menu-content');
        this._buildMenu();

        this._bluetoothChangedId = this._bluetooth.connect('changed', () => this._sync());
        this._openStateId = this.menu.connect(
            'open-state-changed', (_menu, open) => {
                if (open)
                    this._sync();
            });
        this._sync();
    }

    _buildMenu() {
        this._toggle = new PopupMenu.PopupSwitchMenuItem(_('Bluetooth'), false);
        this._toggle.add_style_class_name('lintel-status-toggle');
        this._toggle.connect('toggled', (_item, state) => {
            if (!this._syncing)
                this._bluetooth.setEnabled(state);
        });
        this.menu.addMenuItem(this._toggle);

        this._deviceHeading = new PopupMenu.PopupMenuItem(_('Devices'), {
            reactive: false,
            can_focus: false,
        });
        this._deviceHeading.add_style_class_name('lintel-status-section-title');
        this.menu.addMenuItem(this._deviceHeading);

        this._devicesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._devicesSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addSettingsAction(_('Bluetooth Settings…'), 'gnome-bluetooth-panel.desktop');
    }

    _sync() {
        if (!this._bluetooth)
            return;
        this._syncing = true;
        try {
            const available = this._bluetooth.available;
            this.visible = available;
            this._panelIcon.icon_name = this._bluetooth.iconName;

            const connected = this._bluetooth.connectedDevices;
            this.accessible_name = connected.length > 0
                ? _('Bluetooth, %d connected').format(connected.length)
                : _('Bluetooth, %s').format(this._bluetooth.enabled
                    ? _('on')
                    : _('off'));

            this._toggle.setToggleState(this._bluetooth.enabled);
            this._toggle.sensitive = available;
            this._deviceHeading.visible = this._bluetooth.enabled;
            this._rebuildDevices();
        } finally {
            this._syncing = false;
        }
    }

    _rebuildDevices() {
        this._devicesSection.removeAll();
        if (!this._bluetooth.enabled)
            return;

        const devices = this._bluetooth.devices.slice(0, MAX_VISIBLE_DEVICES);
        if (!devices.length) {
            const empty = new PopupMenu.PopupMenuItem(_('No available or connected devices'), {
                reactive: false,
                can_focus: false,
            });
            empty.add_style_class_name('lintel-status-empty');
            this._devicesSection.addMenuItem(empty);
            return;
        }

        for (const device of devices) {
            const item = new PopupMenu.PopupImageMenuItem(
                device.name, device.iconName);
            item.add_style_class_name('lintel-wifi-network-item');
            item.add_style_class_name('lintel-bluetooth-device-item');
            item.label.x_expand = true;
            item.accessible_name = device.connected
                ? _('Disconnect %s').format(device.name)
                : _('Connect to %s').format(device.name);

            item.setOrnament(device.connected
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);

            item.connect('activate', async () => {
                const handled = await this._bluetooth.toggleDevice(device);
                if (!handled)
                    this._openBluetoothSettings();
            });
            this._devicesSection.addMenuItem(item);
        }
    }

    _openBluetoothSettings() {
        try {
            GioUnix.DesktopAppInfo.new(
                'gnome-bluetooth-panel.desktop')?.launch([], null);
        } catch (e) {
            logError(e, 'lintel: open Bluetooth settings');
        }
    }

    destroy() {
        if (this._bluetoothChangedId && this._bluetooth)
            this._bluetooth.disconnect(this._bluetoothChangedId);
        if (this._openStateId)
            this.menu.disconnect(this._openStateId);
        this._bluetoothChangedId = 0;
        this._openStateId = 0;
        this._bluetooth?.destroy();
        this._bluetooth = null;
        super.destroy();
    }
});
