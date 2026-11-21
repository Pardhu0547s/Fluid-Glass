import Gettext from 'gettext';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import {EXTENSION_ADAPTERS} from '../adapters/index.js';

export const ExtensionAdapters = GObject.registerClass({
    GTypeName: 'FluidGlass_ExtensionAdapters',
    Signals: {'changed': {}},
}, class ExtensionAdapters extends GObject.Object {
    _init(adapters = EXTENSION_ADAPTERS) {
        super._init();
        this._adapters = adapters;
        this._records = new Map();
        this._managerId = 0;
        this._iconTheme = null;
        this._changedId = 0;
        this._enabled = false;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        const manager = Main.extensionManager;
        if (manager) {
            this._managerId = manager.connect('extension-state-changed',
                () => this._refresh());
        }
        this._refresh();
    }

    get entries() {
        const out = [];
        for (const [adapter, record] of this._records) {
            let active;
            try {
                active = !!adapter.read(record.settings);
            } catch (e) {
                logError(e, `fluid-glass: read ${adapter.id} state`);
                continue;
            }
            out.push({
                key: adapter.id,
                title: adapter.title,
                subtitle: adapter.subtitle?.(active) ?? '',
                iconName: this._iconName(adapter, active),
                active,
                visible: true,
            });
        }
        return out;
    }

    toggle(key) {
        for (const [adapter, record] of this._records) {
            if (adapter.id !== key)
                continue;
            try {
                adapter.write(record.settings, !adapter.read(record.settings));
            } catch (e) {
                logError(e, `fluid-glass: toggle ${adapter.id}`);
            }
            return;
        }
    }

    claims(item) {
        const title = item?.title;
        if (!title)
            return false;
        for (const record of this._records.values()) {
            if (record.localizedTitle && record.localizedTitle === title)
                return true;
        }
        return false;
    }

    destroy() {
        this._enabled = false;
        if (this._changedId) {
            GLib.Source.remove(this._changedId);
            this._changedId = 0;
        }
        if (this._managerId) {
            try {
                Main.extensionManager?.disconnect(this._managerId);
            } catch (_e) {
            }
            this._managerId = 0;
        }
        for (const record of this._records.values())
            this._closeRecord(record);
        this._records.clear();
        this._iconTheme = null;
    }

    _refresh() {
        if (!this._enabled)
            return;

        this._iconTheme = null;

        for (const adapter of this._adapters) {
            const extension = this._lookup(adapter.uuid);
            const usable = extension?.state === ExtensionState.ACTIVE;
            const record = this._records.get(adapter);

            if (!usable) {
                if (record) {
                    this._closeRecord(record);
                    this._records.delete(adapter);
                }
                continue;
            }
            if (record)
                continue;

            const settings = this._openSettings(adapter, extension);
            if (!settings)
                continue;

            const ids = (adapter.watchKeys ?? []).map(
                key => settings.connect(`changed::${key}`,
                    () => this._queueChanged()));
            this._records.set(adapter, {
                settings,
                ids,
                localizedTitle: this._localizedTitle(adapter, extension),
            });
        }

        this._queueChanged();
    }

    _lookup(uuid) {
        try {
            return Main.extensionManager?.lookup?.(uuid) ?? null;
        } catch (_e) {
            return null;
        }
    }

    _openSettings(adapter, extension) {
        try {
            let source = Gio.SettingsSchemaSource.get_default();
            const dir = `${extension.path}/schemas`;
            if (GLib.file_test(dir, GLib.FileTest.IS_DIR)) {
                source = Gio.SettingsSchemaSource.new_from_directory(
                    dir, source, false);
            }
            const schema = source?.lookup(adapter.schemaId, true) ?? null;
            if (!schema)
                return null;
            return new Gio.Settings({settings_schema: schema});
        } catch (_e) {
            return null;
        }
    }

    _localizedTitle(adapter, extension) {
        if (!adapter.gettextDomain || !adapter.titleMsgid)
            return null;
        try {
            const dir = `${extension.path}/locale`;
            if (GLib.file_test(dir, GLib.FileTest.IS_DIR))
                Gettext.bindtextdomain(adapter.gettextDomain, dir);
            return Gettext.dgettext(adapter.gettextDomain, adapter.titleMsgid);
        } catch (_e) {
            return null;
        }
    }

    _iconName(adapter, active) {
        const wanted = active
            ? adapter.iconNames?.on
            : adapter.iconNames?.off;
        const fallback = adapter.fallbackIconName ?? 'applications-system-symbolic';
        if (!wanted)
            return fallback;
        try {
            this._iconTheme ??= new St.IconTheme();
            return this._iconTheme.has_icon(wanted) ? wanted : fallback;
        } catch (_e) {
            return fallback;
        }
    }

    _closeRecord(record) {
        for (const id of record.ids) {
            try {
                record.settings.disconnect(id);
            } catch (_e) {
            }
        }
        record.ids = [];
    }

    _queueChanged() {
        if (this._changedId)
            return;
        this._changedId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._changedId = 0;
            if (this._enabled)
                this.emit('changed');
            return GLib.SOURCE_REMOVE;
        });
    }
});
