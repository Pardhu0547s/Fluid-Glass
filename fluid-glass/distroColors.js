import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const DISTRO_ACCENT_COLORS = {
    'fedora': '#007aff',
    'ubuntu': '#ff9500',
    'manjaro': '#34c759',
    'arch': '#1793d1',
    'debian': '#d70a53',
    'opensuse': '#73ba25',
    'pop-os': '#48b9c7',
    'pop': '#48b9c7',
    'redhat': '#ff3b30',
    'centos': '#af52de',
    'rocky': '#10b981',
    'rockylinux': '#10b981',
    'alma': '#ff9500',
    'almalinux': '#ff9500',
    'kali': '#557cbf',
    'gentoo': '#af52de',
    'zorin': '#1ba6f5',
    'mint': '#87cf3e',
    'linuxmint': '#87cf3e',
    'void': '#478061',
    'bazzite': '#6c5ce7',
    'endeavouros': '#7f3fbf',
    'nixos': '#5277c3',
    'solus': '#4a90e2',
    'cachyos': '#00aa88',
    'garuda': '#007aff',
    'nobara': '#007aff',
    'ublue': '#007aff',
    'asahilinux': '#d70a53',
    'steam-deck': '#1a9fff',
    'mx': '#333333',
    'pureos': '#34c759',
    'raspbian': '#c51a4a',
    'vanilla': '#e5a50a',
    'clear-linux': '#007aff',
    'freebsd': '#ff3b30',
    'openbsd': '#e5a50a',
    'netbsd': '#ff9500',
    'tux': '#007aff',
    'gnome': '#007aff',
};

const YARU_ACCENT_COLORS = {
    'blue': '#007aff',
    'prussiangreen': '#21a499',
    'viridian': '#03875b',
    'sage': '#657b69',
    'olive': '#4b8501',
    'bark': '#787859',
    'purple': '#af52de',
    'magenta': '#d56199',
    'red': '#ff3b30',
    'wartybrown': '#b39169',
    'yellow': '#e5a50a',
    'orange': '#ff9500',
};

export const GNOME_ACCENT_COLORS = {
    'blue': '#007aff',
    'teal': '#21a499',
    'green': '#34c759',
    'yellow': '#e5a50a',
    'orange': '#ff9500',
    'red': '#ff3b30',
    'pink': '#d56199',
    'purple': '#af52de',
    'slate': '#545458',
};

export function resolveDistroLogoFile(extensionDir, value) {
    if (!extensionDir || !value)
        return null;
    const cleanName = value.endsWith('.svg') ? value.slice(0, -4) : value;
    const iconsDir = extensionDir.get_child('icons');
    const distrosDir = iconsDir?.get_child('distros');
    const systemMenuDir = iconsDir?.get_child('systemMenu');
    const dirs = [distrosDir, systemMenuDir, iconsDir].filter(Boolean);
    const candidates = [
        `${cleanName}.svg`,
        `${cleanName}-symbolic.svg`,
        `${cleanName}-logo-symbolic.svg`,
        `${cleanName}-logo.svg`,
    ];
    for (const filename of candidates) {
        for (const dir of dirs) {
            const file = dir.get_child(filename);
            if (file?.query_exists(null))
                return file;
        }
    }
    return null;
}

export function getDistroAccentColor(distroNameOrLogo) {
    if (!distroNameOrLogo)
        return null;
    const clean = distroNameOrLogo.toLowerCase().replace(/[-_]?(logo|symbolic|icon)/g, '').trim();
    for (const [key, color] of Object.entries(DISTRO_ACCENT_COLORS)) {
        if (clean === key || clean.includes(key))
            return color;
    }
    return null;
}

export function getHostSystemAccentColor() {
    try {
        const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        const schema = iface.settings_schema;
        if (schema?.has_key('accent-color')) {
            const gnomeAccent = iface.get_string('accent-color');
            if (gnomeAccent && GNOME_ACCENT_COLORS[gnomeAccent] && gnomeAccent !== 'blue')
                return GNOME_ACCENT_COLORS[gnomeAccent];
        }
        if (schema?.has_key('gtk-theme')) {
            const gtkTheme = (iface.get_string('gtk-theme') || '').toLowerCase();
            if (gtkTheme.startsWith('yaru-')) {
                for (const [variant, color] of Object.entries(YARU_ACCENT_COLORS)) {
                    if (gtkTheme.includes(`-${variant}`))
                        return color;
                }
            }
        }
    } catch (_e) {}

    try {
        const id = (GLib.get_os_info('ID') || '').toLowerCase();
        const logo = (GLib.get_os_info('LOGO') || '').toLowerCase();
        const idLike = (GLib.get_os_info('ID_LIKE') || '').toLowerCase();
        const direct = getDistroAccentColor(id) || getDistroAccentColor(logo);
        if (direct)
            return direct;
        for (const token of idLike.split(/\s+/)) {
            const liked = getDistroAccentColor(token);
            if (liked)
                return liked;
        }
    } catch (_e) {}

    return '#007aff';
}

const GREETER_PREFS_PATHS = [
    '/usr/share/gnome-shell/extensions/fluid-glass@pardhu0547s.github.io/greeter-prefs.json',
    '/var/tmp/fluid-glass-greeter-prefs.json',
];

const GREETER_WALLPAPER_PATHS = [
    '/usr/share/gnome-shell/extensions/fluid-glass@pardhu0547s.github.io/greeter-wallpaper',
    '/var/tmp/fluid-glass-greeter-wallpaper',
];

export function isGreeterProcess() {
    try {
        const user = (GLib.get_user_name() || '').toLowerCase();
        return user === 'gdm' || user.startsWith('gdm-');
    } catch (_e) {
        return false;
    }
}

export function readGreeterPrefs() {
    for (const path of GREETER_PREFS_PATHS) {
        try {
            if (!GLib.file_test(path, GLib.FileTest.EXISTS))
                continue;
            const [ok, bytes] = GLib.file_get_contents(path);
            if (!ok || !bytes)
                continue;
            const parsed = JSON.parse(new TextDecoder().decode(bytes));
            if (parsed && typeof parsed === 'object')
                return parsed;
        } catch (_e) {}
    }
    return null;
}

export function syncGreeterPrefs(updates) {
    if (!updates || typeof updates !== 'object' || isGreeterProcess())
        return;
    const current = readGreeterPrefs() ?? {};
    let changed = false;
    for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined && current[k] !== v) {
            current[k] = v;
            changed = true;
        }
    }
    const payload = JSON.stringify(current, null, 2);
    for (const path of GREETER_PREFS_PATHS) {
        try {
            if (!changed && GLib.file_test(path, GLib.FileTest.EXISTS))
                continue;
            GLib.file_set_contents(path, payload);
            GLib.chmod(path, 0o644);
        } catch (_e) {}
    }
}

export function syncGreeterWallpaper(sourcePath) {
    if (isGreeterProcess())
        return '';
    const trimmed = (sourcePath || '').trim();
    if (!trimmed) {
        for (const dest of GREETER_WALLPAPER_PATHS) {
            try {
                if (GLib.file_test(dest, GLib.FileTest.EXISTS))
                    Gio.File.new_for_path(dest).delete(null);
            } catch (_e) {}
        }
        syncGreeterPrefs({'login-wallpaper': ''});
        return '';
    }
    if (!GLib.file_test(trimmed, GLib.FileTest.EXISTS))
        return '';
    let bytes;
    try {
        const [ok, content] = GLib.file_get_contents(trimmed);
        if (!ok || !content || content.length === 0)
            return '';
        bytes = content;
    } catch (_e) {
        return '';
    }
    let activeDest = '';
    for (const dest of GREETER_WALLPAPER_PATHS) {
        try {
            GLib.file_set_contents(dest, bytes);
            GLib.chmod(dest, 0o644);
            if (!activeDest)
                activeDest = dest;
        } catch (_e) {}
    }
    syncGreeterPrefs({'login-wallpaper': activeDest});
    return activeDest;
}

export function readGreeterWallpaper() {
    const prefs = readGreeterPrefs();
    const configured = (prefs?.['login-wallpaper'] || '').trim();
    if (configured && GLib.file_test(configured, GLib.FileTest.EXISTS))
        return configured;
    if (configured === '')
        return '';
    for (const candidate of GREETER_WALLPAPER_PATHS) {
        try {
            if (GLib.file_test(candidate, GLib.FileTest.EXISTS))
                return candidate;
        } catch (_e) {}
    }
    return '';
}

export function resolveAccentColor(masterSettings, topbarSettings = null) {
    const inGreeter = isGreeterProcess();
    const greeterPrefs = inGreeter ? readGreeterPrefs() : null;

    let raw = 'auto';
    if (inGreeter && typeof greeterPrefs?.['accent-color'] === 'string') {
        raw = greeterPrefs['accent-color'].trim().toLowerCase() || 'auto';
    } else {
        try {
            raw = masterSettings?.get_string?.('accent-color')?.trim()?.toLowerCase() ?? 'auto';
        } catch (_e) {
            raw = 'auto';
        }
    }

    let logo = '';
    if (inGreeter && typeof greeterPrefs?.['system-menu-icon'] === 'string') {
        logo = greeterPrefs['system-menu-icon'];
    } else if (topbarSettings) {
        try {
            logo = topbarSettings.get_string('system-menu-icon') ?? '';
        } catch (_e) {
            logo = '';
        }
    }

    if (!inGreeter)
        syncGreeterPrefs({'accent-color': raw, 'system-menu-icon': logo});

    if (raw && raw !== 'auto' && raw !== 'system' && raw !== 'default' && raw.startsWith('#'))
        return raw;

    if (logo) {
        const color = getDistroAccentColor(logo);
        if (color)
            return color;
    }

    return getHostSystemAccentColor();
}
