import Gettext from 'gettext';

const SHELL_DOMAIN = 'gnome-shell';
const SETTINGS_DOMAIN = 'gnome-control-center-2.0';
const CALCULATOR_DOMAIN = 'gnome-calculator';

export function shellText(msgid) {
    return Gettext.dgettext(SHELL_DOMAIN, msgid);
}

export function shellContextText(context, msgid) {
    return Gettext.dpgettext(SHELL_DOMAIN, context, msgid);
}

export function settingsText(msgid) {
    return Gettext.dgettext(SETTINGS_DOMAIN, msgid);
}

export function calculatorText(msgid) {
    return Gettext.dgettext(CALCULATOR_DOMAIN, msgid);
}

export function perSecond(text) {
    const format = settingsText('%d Mb/s');
    const slash = format.lastIndexOf('/');
    return `${text}${slash >= 0 ? format.slice(slash) : '/s'}`;
}

function _fill(format, ...values) {
    return values.reduce((text, value) => text.replace('%u', `${value}`), format);
}

export function formatDuration(seconds) {
    const totalMinutes = Math.max(0, Math.floor(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes)
        return _fill(settingsText('%uh %um'), hours, minutes);
    if (hours)
        return _fill(settingsText('%uh'), hours);
    return _fill(settingsText('%um'), minutes);
}
