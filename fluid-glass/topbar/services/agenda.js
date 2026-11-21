export const HORIZON_DAYS = 7;

function _startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function _addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function _isOver(event, now) {
    if (event.end.getTime() === event.date.getTime())
        return event.date < now;
    return event.end <= now;
}

export function buildAgenda(getEvents, now, days = HORIZON_DAYS) {
    const agenda = [];
    const seen = new Set();
    const today = _startOfDay(now);

    for (let offset = 0; offset < days; offset++) {
        const dayStart = _addDays(today, offset);
        const dayEnd = _addDays(today, offset + 1);
        const events = [];

        for (const event of getEvents(dayStart, dayEnd)) {
            if (seen.has(event.id) || _isOver(event, now))
                continue;
            seen.add(event.id);
            events.push({
                id: event.id,
                summary: event.summary ?? '',
                start: event.date,
                end: event.end,
                allDay: event.date <= dayStart && event.end >= dayEnd,
                startsBefore: event.date < dayStart,
                endsAfter: event.end > dayEnd,
            });
        }

        events.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
        if (events.length)
            agenda.push({date: dayStart, offset, events});
    }
    return agenda;
}
