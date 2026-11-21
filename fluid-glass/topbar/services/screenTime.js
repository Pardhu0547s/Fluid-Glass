import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

const INACTIVE = 0;
const ACTIVE = 1;
const DAY_START_HOUR = 3;
const WEEK_DAYS = 7;
const HOURS_PER_DAY = 24;

export function parseHistory(text) {
    const history = JSON.parse(text);
    if (!Array.isArray(history))
        throw new Error('Screen time history is not an array');

    let previous = 0;
    const states = [INACTIVE, ACTIVE];
    for (const [i, entry] of history.entries()) {
        const valid = entry !== null && typeof entry === 'object' &&
            states.includes(entry.oldState) &&
            states.includes(entry.newState) &&
            entry.oldState !== entry.newState &&
            Number.isSafeInteger(entry.wallTimeSecs) &&
            entry.wallTimeSecs >= previous;
        if (!valid)
            throw new Error(`Malformed screen time history entry ${i}`);
        previous = entry.wallTimeSecs;
    }
    return history;
}

export function dayBounds(unix, offsetDays = 0) {
    const now = GLib.DateTime.new_from_unix_local(unix);
    let start = GLib.DateTime.new_local(now.get_year(), now.get_month(),
        now.get_day_of_month(), DAY_START_HOUR, 0, 0);
    if (now.compare(start) < 0)
        start = start.add_days(-1);
    start = start.add_days(offsetDays);
    return [start.to_unix(), start.add_days(1).to_unix()];
}

export function activeSeconds(history, from, to, now) {
    if (!history.length)
        return 0;

    let total = 0;
    const add = (start, end) => {
        const clippedStart = Math.max(start, from);
        const clippedEnd = Math.min(end, to, now);
        if (clippedEnd > clippedStart)
            total += clippedEnd - clippedStart;
    };

    let state = history[0].oldState;
    let since = dayBounds(history[0].wallTimeSecs)[0];
    for (const entry of history) {
        if (state === ACTIVE)
            add(since, entry.wallTimeSecs);
        state = entry.newState;
        since = entry.wallTimeSecs;
    }
    if (state === ACTIVE)
        add(since, now);
    return total;
}

export function summarize(history, now) {
    const coverage = history.length ? dayBounds(history[0].wallTimeSecs)[0] : now;

    const week = [];
    for (let offset = 1 - WEEK_DAYS; offset <= 0; offset++) {
        const [start, end] = dayBounds(now, offset);
        week.push({
            start,
            seconds: activeSeconds(history, start, end, now),
            known: end > coverage,
        });
    }

    const [todayStart, todayEnd] = dayBounds(now);
    const hours = [];
    const origin = GLib.DateTime.new_from_unix_local(todayStart);
    for (let h = 0; h < HOURS_PER_DAY; h++) {
        const start = origin.add_hours(h).to_unix();
        const end = Math.min(origin.add_hours(h + 1).to_unix(), todayEnd);
        hours.push({start, seconds: activeSeconds(history, start, end, now)});
    }

    const past = week.slice(0, -1).filter(day => day.known);
    const average = past.length
        ? past.reduce((sum, day) => sum + day.seconds, 0) / past.length
        : null;

    return {today: week.at(-1).seconds, average, week, hours};
}

export function historyPath() {
    return GLib.build_filenamev([
        GLib.get_user_data_dir(), 'gnome-shell', 'session-active-history.json',
    ]);
}

export const ScreenTimeService = GObject.registerClass({
    GTypeName: 'FluidGlass_ScreenTimeService',
    Signals: {'changed': {}},
}, class ScreenTimeService extends GObject.Object {
    _init() {
        super._init();
        this._file = Gio.File.new_for_path(historyPath());
        this._history = null;
        this._status = 'loading';
        this._cancellable = null;
        this._destroyed = false;

        this._settingsIds = [];
        this._limits = this._newSettings('org.gnome.desktop.screen-time-limits', [
            'history-enabled', 'daily-limit-enabled', 'daily-limit-seconds',
        ]);
        this._interface = this._newSettings('org.gnome.desktop.interface', [
            'clock-format',
        ]);
        this.refresh();
    }

    _newSettings(schemaId, keys) {
        try {
            const settings = new Gio.Settings({schema_id: schemaId});
            for (const key of keys) {
                this._settingsIds.push([settings, settings.connect(
                    `changed::${key}`, () => this.emit('changed'))]);
            }
            return settings;
        } catch (_e) {
            return null;
        }
    }

    get status() {
        try {
            if (this._limits && !this._limits.get_boolean('history-enabled'))
                return 'disabled';
        } catch (_e) {
        }
        return this._status;
    }

    get summary() {
        return this._history ? summarize(this._history, Math.floor(Date.now() / 1000)) : null;
    }

    get dailyLimit() {
        try {
            return this._limits?.get_boolean('daily-limit-enabled')
                ? this._limits.get_uint('daily-limit-seconds')
                : 0;
        } catch (_e) {
            return 0;
        }
    }

    get uses12h() {
        try {
            return this._interface?.get_string('clock-format') === '12h';
        } catch (_e) {
            return false;
        }
    }

    refresh() {
        if (this._destroyed || this._cancellable)
            return;
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;

        this._file.load_contents_async(cancellable, (file, result) => {
            if (cancellable.is_cancelled())
                return;
            this._cancellable = null;
            try {
                const [, contents] = file.load_contents_finish(result);
                this._history = parseHistory(new TextDecoder().decode(contents));
                this._status = 'ok';
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                    this._history = [];
                    this._status = 'ok';
                } else {
                    console.warn(`fluid-glass: reading screen time history: ${e.message}`);
                    this._history = null;
                    this._status = 'error';
                }
            }
            this.emit('changed');
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._cancellable?.cancel();
        this._cancellable = null;
        for (const [settings, id] of this._settingsIds)
            settings.disconnect(id);
        this._settingsIds = [];
        this._limits?.run_dispose();
        this._interface?.run_dispose();
        this._limits = null;
        this._interface = null;
        this._history = null;
    }
});
