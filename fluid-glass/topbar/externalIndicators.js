import GLib from 'gi://GLib';

import {PanelAdapter} from './compat/panelAdapter.js';
import {isRepresentableQuickSettingsItem} from './services/quickSettingsBridge.js';

export class ExternalIndicators {
    constructor() {
        this._active = false;
        this._box = null;
        this._boxIds = [];
        this._hidden = new Map();
        this._grid = null;
        this._gridIds = [];
        this._syncId = 0;
    }

    apply() {
        const box = PanelAdapter.quickSettingsIndicatorBox;
        if (!box)
            return;

        if (this._box && this._box !== box)
            this._teardown();

        if (!this._active) {
            this._box = box;
            this._boxIds.push(box.connect(
                'child-added', (_b, child) => this._onChildAdded(child)));
            this._boxIds.push(box.connect(
                'child-removed', (_b, child) => this._onChildRemoved(child)));
            this._active = true;
        }

        for (const child of box.get_children())
            this._track(child);

        this._attachGrid();
        this._sync();
    }

    release() {
        this._teardown();
        const container = PanelAdapter.containerOf(PanelAdapter.quickSettings);
        if (container && !container.visible)
            container.show();
    }

    destroy() {
        this.release();
    }

    _attachGrid() {
        const grid = PanelAdapter.quickSettingsGrid;
        if (!grid || grid === this._grid)
            return;

        if (this._grid) {
            for (const id of this._gridIds)
                this._disconnect(this._grid, id);
            this._gridIds = [];
        }

        this._grid = grid;
        this._gridIds.push(grid.connect('child-added', () => this._queueSync()));
        this._gridIds.push(grid.connect('child-removed', () => this._queueSync()));
    }

    _track(child) {
        if (PanelAdapter.isNativeQuickSettingsIndicator(child))
            this._hideNative(child);
    }

    _hideNative(actor) {
        if (this._hidden.has(actor))
            return;
        const id = actor.connect('notify::visible', () => {
            if (actor.visible)
                actor.visible = false;
        });
        this._hidden.set(actor, id);
        actor.visible = false;
    }

    _onChildAdded(child) {
        if (!this._active)
            return;
        this._track(child);
        this._queueSync();
    }

    _onChildRemoved(child) {
        if (!this._active)
            return;
        this._untrackHidden(child);
        this._queueSync();
    }

    _untrackHidden(actor) {
        const id = this._hidden.get(actor);
        if (id === undefined)
            return;
        this._hidden.delete(actor);
        this._disconnect(actor, id);
        PanelAdapter.resyncIndicatorVisibility(actor);
    }

    _disconnect(actor, id) {
        try {
            actor.disconnect(id);
        } catch (_e) {
        }
    }

    _queueSync() {
        if (this._syncId)
            return;
        this._syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncId = 0;
            if (this._active)
                this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        const container = PanelAdapter.containerOf(PanelAdapter.quickSettings);
        if (!container)
            return;

        const wanted = PanelAdapter.externalQuickSettingsItems().some(
            item => !isRepresentableQuickSettingsItem(item));

        if (container.visible !== wanted)
            container.visible = wanted;
    }

    _teardown() {
        if (this._syncId) {
            GLib.Source.remove(this._syncId);
            this._syncId = 0;
        }

        for (const [actor, id] of this._hidden) {
            this._disconnect(actor, id);
            PanelAdapter.resyncIndicatorVisibility(actor);
        }
        this._hidden.clear();

        if (this._box) {
            for (const id of this._boxIds)
                this._disconnect(this._box, id);
        }
        this._boxIds = [];
        this._box = null;

        if (this._grid) {
            for (const id of this._gridIds)
                this._disconnect(this._grid, id);
        }
        this._gridIds = [];
        this._grid = null;

        this._active = false;
    }
}
