// SPDX-License-Identifier: GPL-2.0-or-later
//
// distroColors.js — Distribution and System Default Accent Color Resolution
//

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const DISTRO_ACCENT_COLORS = {
    'fedora': '#007aff',      // Fedora Blue (#3584e4 / #007aff)
    'ubuntu': '#ff9500',      // Ubuntu Orange (#e95420 / #ff9500)
    'manjaro': '#34c759',     // Manjaro Green (#16a085 / #34c759)
    'arch': '#1793d1',        // Arch Cyan/Blue
    'debian': '#d70a53',      // Debian Crimson Red
    'opensuse': '#73ba25',    // openSUSE Green
    'pop-os': '#48b9c7',      // Pop!_OS Teal
    'pop': '#48b9c7',
    'redhat': '#ff3b30',      // Red Hat Red
    'centos': '#af52de',      // CentOS Purple
    'rocky': '#10b981',       // Rocky Linux Emerald
    'rockylinux': '#10b981',
    'alma': '#ff9500',        // AlmaLinux Orange
    'almalinux': '#ff9500',
    'kali': '#557cbf',        // Kali Blue
    'gentoo': '#af52de',      // Gentoo Purple
    'zorin': '#1ba6f5',       // Zorin Sky Blue
    'mint': '#87cf3e',        // Linux Mint Green
    'linuxmint': '#87cf3e',
    'void': '#478061',        // Void Green
    'bazzite': '#6c5ce7',     // Bazzite Violet
    'endeavouros': '#7f3fbf', // EndeavourOS Purple
    'nixos': '#5277c3',       // NixOS Light Blue
    'solus': '#4a90e2',       // Solus Blue
    'cachyos': '#00aa88',     // CachyOS Teal
    'garuda': '#007aff',      // Garuda Blue
    'nobara': '#007aff',      // Nobara Blue
    'ublue': '#007aff',       // Universal Blue
    'asahilinux': '#d70a53',  // Asahi Linux Crimson
    'steam-deck': '#1a9fff',  // Steam Blue
    'mx': '#333333',          // MX Graphite
    'pureos': '#34c759',      // PureOS Green
    'raspbian': '#c51a4a',    // Raspberry Pi Berry
    'vanilla': '#e5a50a',     // Vanilla OS Gold
    'clear-linux': '#007aff', // Clear Linux Blue
    'freebsd': '#ff3b30',     // FreeBSD Red
    'openbsd': '#e5a50a',     // OpenBSD Yellow
    'netbsd': '#ff9500',      // NetBSD Orange
    'tux': '#007aff',         // Tux Blue
    'gnome': '#007aff',       // GNOME Blue
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

/**
 * Resolves a bundled extension icon/distro SVG file from a setting value.
 *
 * @param {Gio.File|null} extensionDir
 * @param {string} value
 * @returns {Gio.File|null}
 */
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

/**
 * Resolves the default accent color for a given distro ID or logo name.
 *
 * @param {string} distroNameOrLogo
 * @returns {string|null} Hex color code
 */
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

/**
 * Resolves the system host distribution default accent color.
 *
 * @returns {string} Hex color code
 */
export function getHostSystemAccentColor() {
    // 1. Try GNOME 47+ desktop interface accent-color, or Yaru variant on older Ubuntu releases.
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

    // 2. Try os-release ID, LOGO, then ID_LIKE tokens.
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

    // Fallback default
    return '#007aff';
}

const GREETER_PREFS_PATHS = [
    '/usr/share/gnome-shell/extensions/fluid-glass@pardhu0547s.github.io/greeter-prefs.json',
    '/var/tmp/fluid-glass-greeter-prefs.json',
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

/**
 * Resolves the active accent color based on user settings and system context.
 *
 * @param {Gio.Settings} [masterSettings]
 * @param {Gio.Settings} [topbarSettings]
 * @returns {string} Hex color string (e.g. '#007aff')
 */
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

    // When 'auto', check if a specific distro logo is currently selected in topbar logo-menu
    if (logo) {
        const color = getDistroAccentColor(logo);
        if (color)
            return color;
    }

    // Otherwise use the host system / distro default
    return getHostSystemAccentColor();
}
