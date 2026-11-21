import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {PanelAdapter} from '../compat/panelAdapter.js';

const WATCHED_PROPERTIES = [
    'notify::title',
    'notify::subtitle',
    'notify::checked',
    'notify::gicon',
    'notify::icon-name',
    'notify::visible',
    'notify::reactive',
];

export function isRepresentableQuickSettingsItem(item) {
    return item instanceof St.Button && item.reactive && 'title' in item;
}

export const QuickSettingsBridge = GObject.registerClass({
    GTypeName: 'FluidGlass_QuickSettingsBridge',
    Signals: {'changed': {}},
}, class QuickSettingsBridge extends GObject.Object {
    _init() {
        super._init();
        this._grid = null;
        this._gridIds = [];
        this._items = new Map();
        this._changedId = 0;
        this._enabled = false;
    }

    enable() {
        this._enabled = true;
        this._attach();
    }

    get items() {
        if (!this._enabled)
            return [];
        return PanelAdapter.externalQuickSettingsItems().filter(
            item => this._isRepresentable(item));
    }

    activate(item) {
        if (!item || !this._isRepresentable(item))
            return;
        try {
            if (item.toggle_mode)
                item.checked = !item.checked;
            item.emit('clicked', 0);
        } catch (e) {
            logError(e, 'fluid-glass: activate third-party quick settings item');
        }
    }

    hasMenu(item) {
        return !!item?.menu;
    }

    destroy() {
        this._enabled = false;
        if (this._changedId) {
            GLib.Source.remove(this._changedId);
            this._changedId = 0;
        }
        for (const [item, ids] of this._items) {
            for (const id of ids)
                this._disconnect(item, id);
        }
        this._items.clear();
        if (this._grid) {
            for (const id of this._gridIds)
                this._disconnect(this._grid, id);
        }
        this._gridIds = [];
        this._grid = null;
    }

    _attach() {
        const grid = PanelAdapter.quickSettingsGrid;
        if (!grid)
            return;

        if (this._grid && this._grid !== grid) {
            const stale = this._enabled;
            this.destroy();
            this._enabled = stale;
        }

        if (!this._grid) {
            this._grid = grid;
            this._gridIds.push(grid.connect(
                'child-added', (_g, child) => this._onChildAdded(child)));
            this._gridIds.push(grid.connect(
                'child-removed', (_g, child) => this._onChildRemoved(child)));
        }

        for (const item of PanelAdapter.externalQuickSettingsItems())
            this._watch(item);

        this._queueChanged();
    }

    _watch(item) {
        if (this._items.has(item) || !this._isRepresentable(item))
            return;
        const ids = WATCHED_PROPERTIES.map(
            signal => item.connect(signal, () => this._queueChanged()));
        this._items.set(item, ids);
    }

    _onChildAdded(child) {
        if (!this._enabled)
            return;
        this._watch(child);
        this._queueChanged();
    }

    _onChildRemoved(child) {
        if (!this._enabled)
            return;
        const ids = this._items.get(child);
        if (ids) {
            this._items.delete(child);
            for (const id of ids)
                this._disconnect(child, id);
        }
        this._queueChanged();
    }

    _isRepresentable(item) {
        return isRepresentableQuickSettingsItem(item);
    }

    _disconnect(object, id) {
        try {
            object.disconnect(id);
        } catch (_e) {
        }
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
