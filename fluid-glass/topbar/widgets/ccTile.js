// SPDX-License-Identifier: GPL-2.0-or-later
//
// Reusable macOS-Control-Center controls. The popup deliberately uses a small
// set of actors with predictable geometry instead of GNOME Quick Settings
// widgets: their layout changes between Shell releases, while these controls
// need to keep the compact Tahoe composition on GNOME 50 and 51.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {_} from '../i18n.js';

/** A horizontal network/focus capsule with a circular state icon. */
export const CCTile = GObject.registerClass(
class CCTile extends St.Button {
    _init(iconName, title, styleClass = '') {
        const classes = ['lintel-cc-tile', styleClass]
            .filter(Boolean).join(' ');
        super._init({
            style_class: classes,
            accessible_name: title,
            can_focus: true,
            x_expand: true,
            toggle_mode: true,
        });

        const box = new St.BoxLayout({
            style_class: 'lintel-cc-tile-box',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const iconProps = typeof iconName === 'string'
            ? {icon_name: iconName}
            : {gicon: iconName};
        this._icon = new St.Icon({
            ...iconProps,
            style_class: 'lintel-cc-tile-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._iconBadge = new St.Bin({
            style_class: 'lintel-cc-tile-icon-badge',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            child: this._icon,
        });
        // macOS Tahoe: circular icon badge on the left, title/status left-aligned
        // right beside it.
        this._labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lintel-cc-tile-labels',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({
            text: title,
            style_class: 'lintel-cc-tile-title',
            x_align: Clutter.ActorAlign.START,
        });
        this._status = new St.Label({
            style_class: 'lintel-cc-tile-status',
            x_align: Clutter.ActorAlign.START,
            visible: false,
        });
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._status.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._labels.add_child(this._title);
        this._labels.add_child(this._status);
        box.add_child(this._iconBadge);
        box.add_child(this._labels);
        this.set_child(box);
    }

    /**
     * A control resized to one grid cell is Tahoe's circle: the glyph alone,
     * centred. The title stays the accessible name, so it is not lost.
     */
    setCompact(compact) {
        this._labels.visible = !compact;
        this._iconBadge.x_expand = compact;
        this._iconBadge.x_align = compact
            ? Clutter.ActorAlign.CENTER
            : Clutter.ActorAlign.START;
        if (compact)
            this.add_style_class_name('lintel-cc-tile-compact');
        else
            this.remove_style_class_name('lintel-cc-tile-compact');
    }

    setTitle(text) {
        this._title.text = text;
        this.accessible_name = text;
    }

    setActive(active, statusText = '') {
        this.checked = active;
        if (active) {
            this._icon.add_style_pseudo_class('checked');
            this._iconBadge.add_style_pseudo_class('checked');
        } else {
            this._icon.remove_style_pseudo_class('checked');
            this._iconBadge.remove_style_pseudo_class('checked');
        }
        this._status.text = statusText;
        this._status.visible = Boolean(statusText);
    }

    setIcon(name) {
        this._icon.icon_name = name;
    }

    /**
     * Third-party Quick Settings tiles carry a GIcon (often a themed icon from
     * the extension's own directory), not an icon name, so take it as-is.
     */
    setGicon(gicon) {
        if (gicon)
            this._icon.gicon = gicon;
    }
});

function _sfIcon(filename, fallbackName = '') {
    try {
        const uri = new URL(`../icons/${filename}`, import.meta.url).href;
        const file = Gio.File.new_for_uri(uri);
        if (file.query_exists(null))
            return new Gio.FileIcon({file});
    } catch (_e) {
        // Fallback to icon_name
    }
    return fallbackName;
}

/** The large 2×2 Now Playing module from the right side of Control Center. */
export const CCMediaCard = GObject.registerClass({
    Signals: {
        previous: {},
        'play-pause': {},
        next: {},
    },
},
class CCMediaCard extends St.BoxLayout {
    _init(styleClass = 'lintel-cc-media') {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: styleClass,
            accessible_name: _('Now Playing'),
            x_expand: true,
            y_expand: true,
        });

        this._currentArtUrl = null;
        this._playingState = null;

        // Top-left rounded square artwork (macOS Tahoe vertical media layout)
        this._artwork = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'lintel-cc-media-artwork',
            icon_size: 20,
            width: 42,
            height: 42,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const artBin = new St.Bin({
            style_class: 'lintel-cc-media-artwork-bin',
            width: 42,
            height: 42,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            child: this._artwork,
        });
        this.add_child(artBin);

        // Middle: track title + artist stacked vertically below the artwork
        const metadata = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lintel-cc-media-metadata',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({
            text: _('Not Playing'),
            style_class: 'lintel-cc-media-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._artist = new St.Label({
            text: '',
            style_class: 'lintel-cc-media-artist',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            visible: false,
        });
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        metadata.add_child(this._title);
        metadata.add_child(this._artist);
        this.add_child(metadata);

        // Bottom: transport controls evenly distributed across the width
        const controls = new St.BoxLayout({
            style_class: 'lintel-cc-media-controls',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.END,
        });
        this._playGicon = _sfIcon('tahoe-media-play-symbolic.svg', 'media-playback-start-symbolic');
        this._pauseGicon = _sfIcon('tahoe-media-pause-symbolic.svg', 'media-playback-pause-symbolic');
        const actions = [
            [_sfIcon('tahoe-media-backward-symbolic.svg', 'media-skip-backward-symbolic'), _('Previous'), 'previous'],
            [this._playGicon, _('Play'), 'play-pause'],
            [_sfIcon('tahoe-media-forward-symbolic.svg', 'media-skip-forward-symbolic'), _('Next'), 'next'],
        ];
        for (const [iconRef, label, signal] of actions) {
            const isPlay = signal === 'play-pause';
            const iconProps = typeof iconRef === 'string'
                ? {icon_name: iconRef}
                : {gicon: iconRef};
            const icon = new St.Icon({
                ...iconProps,
                style_class: isPlay
                    ? 'lintel-cc-media-control lintel-cc-media-play-icon'
                    : 'lintel-cc-media-control',
            });
            if (isPlay)
                this._playIcon = icon;
            const button = new St.Button({
                style_class: isPlay
                    ? 'lintel-cc-media-button lintel-cc-media-play'
                    : 'lintel-cc-media-button',
                accessible_name: label,
                can_focus: true,
                x_expand: true,
                child: icon,
            });
            button.connect('clicked', () => this.emit(signal));
            controls.add_child(button);
        }
        this.add_child(controls);
    }

    setTrack(title, artist, artUrl, playing) {
        const nextTitle = title || _('Not Playing');
        if (this._title.text !== nextTitle)
            this._title.text = nextTitle;

        const nextArtist = artist || '';
        if (this._artist.text !== nextArtist) {
            this._artist.text = nextArtist;
            this._artist.visible = Boolean(artist);
        }

        const isPlaying = Boolean(playing);
        if (this._playingState !== isPlaying) {
            this._playingState = isPlaying;
            const target = isPlaying ? this._pauseGicon : this._playGicon;
            if (typeof target === 'string')
                this._playIcon.icon_name = target;
            else
                this._playIcon.gicon = target;
        }

        const nextArtUrl = artUrl || '';
        if (this._currentArtUrl !== nextArtUrl) {
            this._currentArtUrl = nextArtUrl;
            if (nextArtUrl) {
                try {
                    this._artwork.gicon = new Gio.FileIcon({
                        file: Gio.File.new_for_uri(nextArtUrl),
                    });
                    this._artwork.icon_size = 42;
                    return;
                } catch (_e) {
                    // Fall through to the neutral media glyph.
                }
            }
            if (this._artwork.gicon)
                this._artwork.gicon = null;
            this._artwork.icon_size = 20;
            if (this._artwork.icon_name !== 'audio-x-generic-symbolic')
                this._artwork.icon_name = 'audio-x-generic-symbolic';
        }
    }
});

/**
 * A labelled Tahoe slider card. The leading glyph can be a real button (volume
 * uses it for mute), the trailing glyph is the maximum-value indicator, and the
 * optional rightmost circular accessory button opens the corresponding settings.
 */
export const CCSlider = GObject.registerClass({
    Signals: {
        'moved': {param_types: [GObject.TYPE_DOUBLE]},
        'icon-clicked': {},
        'accessory-clicked': {},
    },
}, class CCSlider extends St.BoxLayout {
    _init(title, iconName, trailingIconName = '', iconClickable = false, accessoryIconName = '') {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lintel-cc-slider',
            accessible_name: title,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });

        this._block = false;
        this._iconClickable = iconClickable;
        this.add_child(new St.Label({
            text: title,
            style_class: 'lintel-cc-slider-title',
            x_align: Clutter.ActorAlign.START,
        }));

        const row = new St.BoxLayout({
            style_class: 'lintel-cc-slider-row',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const leadProps = typeof iconName === 'string'
            ? {icon_name: iconName}
            : {gicon: iconName};
        this._icon = new St.Icon({
            ...leadProps,
            style_class: 'lintel-cc-slider-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._iconButton = new St.Button({
            style_class: 'lintel-cc-slider-icon-button',
            accessible_name: iconClickable ? _('Toggle %s').format(title) : title,
            can_focus: iconClickable,
            reactive: iconClickable,
            y_align: Clutter.ActorAlign.CENTER,
            child: this._icon,
        });
        this._iconButton.connect('clicked', () => this.emit('icon-clicked'));
        row.add_child(this._iconButton);

        this._slider = new Slider.Slider(0);
        this._slider.add_style_class_name('lintel-cc-track');
        this._slider.accessible_name = _('%s level').format(title);
        this._slider.x_expand = true;
        this._slider.x_align = Clutter.ActorAlign.FILL;
        this._slider.y_align = Clutter.ActorAlign.CENTER;
        this._slider.connect('notify::value', () => {
            if (!this._block)
                this.emit('moved', this._slider.value);
        });
        row.add_child(this._slider);

        if (trailingIconName) {
            const trailProps = typeof trailingIconName === 'string'
                ? {icon_name: trailingIconName}
                : {gicon: trailingIconName};
            row.add_child(new St.Icon({
                ...trailProps,
                style_class: 'lintel-cc-slider-trailing-icon',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }

        if (accessoryIconName) {
            const accProps = typeof accessoryIconName === 'string'
                ? {icon_name: accessoryIconName}
                : {gicon: accessoryIconName};
            const accIcon = new St.Icon({
                ...accProps,
                style_class: 'lintel-cc-slider-accessory-icon',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._accessoryButton = new St.Button({
                style_class: 'lintel-cc-slider-accessory-button',
                accessible_name: _('%s Settings').format(title),
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
                child: accIcon,
            });
            this._accessoryButton.connect('clicked', () => this.emit('accessory-clicked'));
            row.add_child(this._accessoryButton);
        }
        this.add_child(row);
    }

    setValue(fraction) {
        const clamped = Math.max(0, Math.min(1, fraction));
        if (Math.abs(this._slider.value - clamped) < 0.001)
            return;
        this._block = true;
        this._slider.value = clamped;
        this._block = false;
    }

    setIcon(nameOrGicon) {
        if (!nameOrGicon)
            return;
        if (typeof nameOrGicon === 'string') {
            if (this._icon.icon_name !== nameOrGicon)
                this._icon.icon_name = nameOrGicon;
        } else if (this._icon.gicon !== nameOrGicon) {
            this._icon.gicon = nameOrGicon;
        }
    }

    setAvailable(available) {
        this._slider.reactive = available;
        this._iconButton.reactive = available && this._iconClickable;
        this._iconButton.can_focus = available && this._iconClickable;
        this.opacity = available ? 255 : 150;
    }
});
