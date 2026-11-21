import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

const COLUMNS = 4;

export const SHAPES = Object.freeze({
    small: {columns: 1, rows: 1},
    wide: {columns: 2, rows: 1},
    large: {columns: 2, rows: 2},
});

export function packModules(modules) {
    const taken = [];
    const free = (row, column, columns, rows) => {
        for (let r = row; r < row + rows; r++) {
            for (let c = column; c < column + columns; c++) {
                if (taken[r]?.[c])
                    return false;
            }
        }
        return true;
    };
    const take = (row, column, columns, rows) => {
        for (let r = row; r < row + rows; r++) {
            taken[r] ??= new Array(COLUMNS).fill(false);
            for (let c = column; c < column + columns; c++)
                taken[r][c] = true;
        }
    };

    const placements = [];
    for (const module of modules) {
        const {columns, rows} = SHAPES[module.shape] ?? SHAPES.wide;
        const step = columns === 1 ? 1 : 2;
        let placed = false;
        for (let row = 0; !placed; row++) {
            for (let column = 0; column < COLUMNS && !placed; column += step) {
                if (!free(row, column, columns, rows))
                    continue;
                take(row, column, columns, rows);
                placements.push({module, row, column, columns, rows});
                placed = true;
            }
        }
    }

    return placements;
}

const CCGridLayout = GObject.registerClass(
class CCGridLayout extends Clutter.LayoutManager {
    _init() {
        super._init();
        this._placements = [];
    }

    setPlacements(placements) {
        this._placements = placements;
        this.layout_changed();
    }

    _length(container, name, fallback) {
        const node = container.peek_theme_node?.();
        if (!node)
            return fallback;
        const [found, value] = node.lookup_length(name, false);
        return found ? value : fallback;
    }

    _geometry(container, width) {
        const gutter = this._length(container, '-fluid-glass-grid-gutter', 12);
        const pairGap = this._length(container, '-fluid-glass-grid-pair-gap', 18);
        const rowGap = this._length(container, '-fluid-glass-grid-row-gap', 10);
        const half = Math.max(0, (width - gutter) / 2);
        const cell = Math.max(0, (half - pairGap) / 2);
        const x = [0, cell + pairGap, half + gutter, half + gutter + cell + pairGap];
        const spanWidth = p => x[p.column + p.columns - 1] + cell - x[p.column];

        const shown = this._placements.filter(p => p.module.actor.visible);
        const rowCount = shown.reduce((n, p) => Math.max(n, p.row + p.rows), 0);
        const heights = new Array(rowCount).fill(cell);

        const y = [];
        let offset = 0;
        for (let r = 0; r < rowCount; r++) {
            y.push(offset);
            offset += heights[r] + rowGap;
        }
        const total = rowCount ? offset - rowGap : 0;
        return {x, y, cell, heights, rowGap, spanWidth, shown, total};
    }

    vfunc_get_preferred_width(_container, _forHeight) {
        return [0, 0];
    }

    vfunc_get_preferred_height(container, forWidth) {
        const width = forWidth >= 0 ? forWidth : container.width;
        const {total} = this._geometry(container, width);
        return [total, total];
    }

    vfunc_allocate(container, box) {
        const geometry = this._geometry(container, box.get_width());
        const {x, y, cell, heights, rowGap, spanWidth} = geometry;
        for (const p of geometry.shown) {
            const width = spanWidth(p);
            let height = heights.slice(p.row, p.row + p.rows)
                .reduce((sum, h) => sum + h, 0) + rowGap * (p.rows - 1);
            let top = y[p.row];
            if (p.columns === 1 && height > cell) {
                top += (height - cell) / 2;
                height = cell;
            }
            const child = new Clutter.ActorBox();
            child.set_origin(box.x1 + x[p.column], box.y1 + top);
            child.set_size(width, height);
            p.module.actor.allocate(child);
        }
    }
});

export const CCGrid = GObject.registerClass(
class CCGrid extends St.Widget {
    _init() {
        super._init({
            style_class: 'fluid-glass-cc-grid',
            layout_manager: new CCGridLayout(),
            x_expand: true,
        });
    }

    setModules(modules) {
        for (const {actor} of modules) {
            const parent = actor.get_parent();
            if (parent === this)
                continue;
            parent?.remove_child(actor);
            this.add_child(actor);
        }
        const placements = packModules(
            modules.filter(module => module.actor.visible));
        this.layout_manager.setPlacements(placements);
        return placements;
    }
});
