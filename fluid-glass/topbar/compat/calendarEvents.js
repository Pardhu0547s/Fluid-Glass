import Shell from 'gi://Shell';

import * as Calendar from 'resource:///org/gnome/shell/ui/calendar.js';
import {formatTime} from 'resource:///org/gnome/shell/misc/dateUtils.js';

const GRID_SUPERSET_DAYS = 49;

let _source = null;
let _users = 0;

function _addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function acquireEventSource() {
    if (!_source)
        _source = new Calendar.DBusEventSource();
    _users++;
    return _source;
}

export function releaseEventSource(source) {
    if (!source || source !== _source || _users === 0)
        return;
    _users--;
    if (_users === 0) {
        _source.destroy();
        _source = null;
    }
}

export function requestEventRange(source, now, horizonDays) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysToWeekStart = (7 + first.getDay() - Shell.util_get_week_start()) % 7;
    const begin = _addDays(first, -(daysToWeekStart + 7));
    const gridEnd = _addDays(begin, GRID_SUPERSET_DAYS);
    const horizonEnd = _addDays(now, horizonDays);
    source.requestRange(begin, horizonEnd > gridEnd ? horizonEnd : gridEnd);
}

export function formatEventTime(date) {
    return formatTime(date, {timeOnly: true});
}
