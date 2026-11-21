import {PanelAdapter} from './compat/panelAdapter.js';

function _isAlive(actor) {
    if (!actor)
        return false;
    try {
        void actor.visible;
        return true;
    } catch (_e) {
        return false;
    }
}

export class PanelSnapshot {
    constructor() {
        this._boxes = new Map();
        this._panelStyleClasses = null;
    }

    static capture() {
        const snap = new PanelSnapshot();
        for (const box of PanelAdapter.boxes) {
            if (!_isAlive(box))
                continue;
            const children = box.get_children();
            const visible = new Map();
            for (const child of children) {
                if (_isAlive(child))
                    visible.set(child, child.visible);
            }
            snap._boxes.set(box, {children, visible});
        }

        const panel = PanelAdapter.actor;
        if (_isAlive(panel)) {
            try {
                snap._panelStyleClasses = panel.get_style_class_name();
            } catch (_e) {
                snap._panelStyleClasses = null;
            }
        }
        return snap;
    }

    restore() {
        for (const [box, state] of this._boxes) {
            if (!_isAlive(box))
                continue;

            const {children, visible} = state;
            children.forEach((child, idx) => {
                if (!_isAlive(child))
                    return;

                const currentParent = child.get_parent();
                if (currentParent !== box) {
                    currentParent?.remove_child(child);
                    const at = Math.min(idx, box.get_n_children());
                    box.insert_child_at_index(child, at);
                } else {
                    const at = Math.min(idx, box.get_n_children() - 1);
                    box.set_child_at_index(child, at);
                }

                if (visible.has(child))
                    child.visible = visible.get(child);
            });
        }

        const panel = PanelAdapter.actor;
        if (this._panelStyleClasses !== null && _isAlive(panel)) {
            try {
                panel.set_style_class_name(this._panelStyleClasses);
            } catch (_e) {
            }
        }
    }

    destroy() {
        this._boxes.clear();
        this._panelStyleClasses = null;
    }
}
