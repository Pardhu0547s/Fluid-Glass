import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GObject from 'gi://GObject';
import NM from 'gi://NM';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {_} from '../i18n.js';
import {ConnectivityService} from '../services/connectivity.js';
import {styleStatusMenu} from './statusMenu.js';

function _iconNamesForEntry(entry, limited = false) {
    if (entry.connecting)
        return ['network-wired-acquiring-symbolic', 'network-wired-symbolic'];
    if (entry.kind === 'usb')
        return ['phone-symbolic', 'smartphone-symbolic', 'network-wired-symbolic'];
    if (entry.kind === 'modem')
        return ['network-cellular-connected-symbolic', 'network-wired-symbolic'];
    if (limited)
        return ['network-wired-no-route-symbolic', 'network-wired-symbolic'];
    return ['network-wired-symbolic'];
}

function _entryTitle(entry) {
    if (entry.kind === 'usb')
        return entry.product ? _('USB · %s').format(entry.product) : _('USB Tethering');
    if (entry.kind === 'modem')
        return entry.connectionName || _('Mobile Broadband');
    if (entry.connectionName)
        return entry.connectionName;
    return entry.iface ? _('Ethernet (%s)').format(entry.iface) : _('Wired LAN');
}

function _entrySubtitle(entry) {
    if (entry.connecting)
        return _('Connecting…');
    if (entry.connected)
        return entry.ip4 || _('Connected');
    return _('Plugged in');
}

export const FluidGlassWiredMenu = GObject.registerClass({
    GTypeName: 'FluidGlass_WiredMenu',
}, class FluidGlassWiredMenu extends PanelMenu.Button {
    _init() {
        super._init(0.5, _('Wired & Tethering'), false);
        this.add_style_class_name('fluid-glass-status-button');
        this.visible = false;

        this._net = new ConnectivityService();
        this._changedId = 0;
        this._openStateId = 0;

        this._panelIcon = new St.Icon({
            style_class: 'system-status-icon',
            icon_name: 'network-wired-symbolic',
        });
        this.add_child(this._panelIcon);

        styleStatusMenu(this.menu, 'fluid-glass-wired-menu-content');
        this._buildMenu();

        this._changedId = this._net.connect('changed', () => this._sync());
        this._openStateId = this.menu.connect('open-state-changed', () => this._sync());
        this._sync();
    }

    _buildMenu() {
        this._heading = new PopupMenu.PopupMenuItem(_('Wired & USB Network'), {
            reactive: false,
            can_focus: false,
        });
        this._heading.add_style_class_name('fluid-glass-status-section-title');
        this.menu.addMenuItem(this._heading);

        this._devicesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._devicesSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addSettingsAction(_('Network Settings…'), 'gnome-network-panel.desktop');
    }

    _pickPrimary(active) {
        return active.find(e => e.connected) ?? active[0];
    }

    _sync() {
        if (!this._net)
            return;
        const all = this._net.wiredConnections;
        const active = all.filter(e => e.connected || e.connecting);
        this.visible = active.length > 0;
        if (!active.length)
            return;

        const primary = this._pickPrimary(active);
        const connState = this._net.connectivityState;
        const limited = primary.connected &&
            (connState === NM.ConnectivityState.LIMITED ||
             connState === NM.ConnectivityState.PORTAL);
        this._panelIcon.gicon = Gio.ThemedIcon.new_from_names(
            _iconNamesForEntry(primary, limited));

        const title = _entryTitle(primary);
        this.accessible_name = primary.connected
            ? _('%s, connected').format(title)
            : _('%s, connecting').format(title);

        this._rebuildDevices(all);
    }

    _rebuildDevices(entries) {
        this._devicesSection.removeAll();
        for (const entry of entries) {
            const gicon = Gio.ThemedIcon.new_from_names(_iconNamesForEntry(entry));
            const title = _entryTitle(entry);
            const item = new PopupMenu.PopupImageMenuItem(title, 'network-wired-symbolic');
            if (item._icon)
                item._icon.gicon = gicon;
            item.add_style_class_name('fluid-glass-wifi-network-item');
            item.label.x_expand = true;
            item.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

            const sub = _entrySubtitle(entry);
            if (sub) {
                const detail = new St.Label({
                    text: sub,
                    style_class: 'fluid-glass-wired-status-detail',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                item.add_child(detail);
            }

            item.setOrnament(entry.connected
                ? PopupMenu.Ornament.CHECK
                : entry.connecting
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE);

            item.accessible_name = entry.connected
                ? _('Disconnect %s').format(title)
                : _('Connect %s').format(title);

            item.connect('activate', () => {
                const handled = entry.connected || entry.connecting
                    ? this._net?.deactivateDeviceConnection(entry.device)
                    : this._net?.activateDeviceConnection(entry.device);
                this.menu.close();
                if (!handled)
                    this._openNetworkSettings();
            });
            this._devicesSection.addMenuItem(item);
        }
    }

    _openNetworkSettings() {
        try {
            GioUnix.DesktopAppInfo.new(
                'gnome-network-panel.desktop')?.launch([], null);
        } catch (e) {
            logError(e, 'fluid-glass: open Network settings');
        }
    }

    destroy() {
        if (this._changedId && this._net)
            this._net.disconnect(this._changedId);
        if (this._openStateId)
            this.menu.disconnect(this._openStateId);
        this._changedId = 0;
        this._openStateId = 0;
        this._net?.destroy();
        this._net = null;
        super.destroy();
    }
});
