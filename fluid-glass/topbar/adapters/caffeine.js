import {_} from '../i18n.js';

const STATE_KEY = 'cli-toggle';

export const CaffeineAdapter = {
    id: 'caffeine',
    uuid: 'caffeine@patapon.info',
    schemaId: 'org.gnome.shell.extensions.caffeine',

    title: 'Caffeine',

    gettextDomain: 'gnome-shell-extension-caffeine',
    titleMsgid: 'Caffeine',

    iconNames: {on: 'my-caffeine-on-symbolic', off: 'my-caffeine-off-symbolic'},
    fallbackIconName: 'user-idle-symbolic',

    watchKeys: [STATE_KEY],

    read(settings) {
        return settings.get_boolean(STATE_KEY);
    },

    write(settings, active) {
        settings.set_boolean(STATE_KEY, active);
    },

    subtitle(active) {
        return active ? _('On') : _('Off');
    },
};
