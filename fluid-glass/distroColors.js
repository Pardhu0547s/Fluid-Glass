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
    'freebsd': '#ff3b30',     // FreeBSD Red
    'tux': '#007aff',         // Tux Blue
    'gnome': '#007aff',       // GNOME Blue
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
    // 1. Try GNOME 47+ desktop interface accent-color
    try {
        const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        const gnomeAccent = iface.get_string('accent-color');
        if (gnomeAccent && GNOME_ACCENT_COLORS[gnomeAccent]) {
            if (gnomeAccent !== 'blue')
                return GNOME_ACCENT_COLORS[gnomeAccent];
        }
    } catch (_e) {}

    // 2. Try os-release ID or LOGO
    try {
        const id = (GLib.get_os_info('ID') || '').toLowerCase();
        const logo = (GLib.get_os_info('LOGO') || '').toLowerCase();
        const color = getDistroAccentColor(id) || getDistroAccentColor(logo);
        if (color)
            return color;
    } catch (_e) {}

    // Fallback default
    return '#007aff';
}

/**
 * Resolves the active accent color based on user settings and system context.
 *
 * @param {Gio.Settings} [masterSettings]
 * @param {Gio.Settings} [topbarSettings]
 * @returns {string} Hex color string (e.g. '#007aff')
 */
export function resolveAccentColor(masterSettings, topbarSettings = null) {
    let raw = 'auto';
    try {
        raw = masterSettings?.get_string?.('accent-color')?.trim()?.toLowerCase() ?? 'auto';
    } catch (_e) {
        raw = 'auto';
    }

    if (raw && raw !== 'auto' && raw !== 'system' && raw !== 'default' && raw.startsWith('#'))
        return raw;

    // When 'auto', check if a specific distro logo is currently selected in topbar logo-menu
    if (topbarSettings) {
        try {
            const logo = topbarSettings.get_string('system-menu-icon');
            if (logo) {
                const color = getDistroAccentColor(logo);
                if (color)
                    return color;
            }
        } catch (_e) {}
    }

    // Otherwise use the host system / distro default
    return getHostSystemAccentColor();
}
