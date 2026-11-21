import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class NotificationAlignment {
    constructor() {
        this._original = null;
        this._captured = false;
    }

    static get _tray() {
        return Main.messageTray ?? null;
    }

    capture() {
        const tray = NotificationAlignment._tray;
        if (!tray)
            return;
        try {
            this._original = tray.bannerAlignment;
            this._captured = true;
        } catch (_e) {
            this._captured = false;
        }
    }

    apply(align = Clutter.ActorAlign.END) {
        const tray = NotificationAlignment._tray;
        if (!tray)
            return;
        try {
            if (tray.bannerAlignment !== align)
                tray.bannerAlignment = align;
        } catch (_e) {
        }
    }

    restore() {
        const tray = NotificationAlignment._tray;
        if (!tray)
            return;
        try {
            tray.bannerAlignment = this._original ?? Clutter.ActorAlign.CENTER;
        } catch (_e) {
        }
    }

    destroy() {
        this._captured = false;
        this._original = null;
    }
}
