import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

const DEBOUNCE_MS = 80;

export const WindowTracker = GObject.registerClass({
    GTypeName: 'FluidGlass_WindowTracker',
    Signals: {'app-changed': {}},
}, class WindowTracker extends GObject.Object {
    _init() {
        super._init();
        this._shellTracker = Shell.WindowTracker.get_default();
        this._notifyId = 0;
        this._debounceId = 0;
    }

    start() {
        if (this._notifyId)
            return;
        this._notifyId = this._shellTracker.connect(
            'notify::focus-app', () => this._queue());
    }

    get focusApp() {
        return this._shellTracker?.focus_app ?? null;
    }

    _queue() {
        if (this._debounceId)
            return;
        this._debounceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
                this._debounceId = 0;
                this.emit('app-changed');
                return GLib.SOURCE_REMOVE;
            });
    }

    destroy() {
        if (this._debounceId) {
            GLib.Source.remove(this._debounceId);
            this._debounceId = 0;
        }
        if (this._notifyId) {
            this._shellTracker.disconnect(this._notifyId);
            this._notifyId = 0;
        }
        this._shellTracker = null;
    }
});
