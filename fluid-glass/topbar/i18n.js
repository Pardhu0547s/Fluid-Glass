import Gettext from 'gettext';

export const GETTEXT_DOMAIN = 'fluid-glass@pardhu0547s.github.io';

export function gettext(message) {
    return Gettext.dgettext(GETTEXT_DOMAIN, message);
}

export function ngettext(singular, plural, count) {
    return Gettext.dngettext(GETTEXT_DOMAIN, singular, plural, count);
}

export function pgettext(context, message) {
    return Gettext.dpgettext(GETTEXT_DOMAIN, context, message);
}

export {gettext as _};
