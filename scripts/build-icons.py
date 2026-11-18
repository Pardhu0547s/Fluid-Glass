#!/usr/bin/env python3
"""Build square-free 3D macOS icon themes (Papirus-MacOS-Dark & Papirus-MacOS-Light).

Follows the reference design:
  - Free-standing 3D macOS app icons WITHOUT outer white/dark background squares
    (Settings gear, Chrome, Safari, Firefox, VS Code, Notes with pen, Calculator,
    Clock, Camera, Pink Music note, Purple Videos triangle, Rainbow Photos flower,
    Bluetooth rune, Wi-Fi arcs, 3D Hard Drive, 3D Display Monitor, 3D Printer,
    3D Trash basket, 3D Search magnifier, Colorful Maps pin, 3D Cloud, 3D Puzzle
    Extensions, 3D Sliders Tweaks, etc.).
  - Natural screen/tile icons (Finder face, Terminal `>_` & `>`, Calendar `JUL 17`,
    System Monitor ECG screen) preserve their authentic macOS bodies.
  - Row-4 colorful 3D macOS folders in places/scalable (Blue Home, Cyan Desktop,
    Azure Documents, Green Downloads, Purple Pictures, Pink Music, Orange Videos,
    Teal Public/Users, Lime Code/Development, Blue Packages).
  - Automated background-squircle stripper for all remaining 1,350+ MacTahoe and
    Papirus/hicolor app icons, transferring brand gradients onto knockout glyphs
    and scaling free-standing symbols to full size.
  - Relative sibling symlinks (../MacTahoe-dark/...) and Adwaita inheritance so
    Flatpak sandboxes (e.g. Extension Manager) resolve every symbolic icon cleanly.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import math
import os
from pathlib import Path
import re
import shutil
import sys
from typing import Iterable

import cairo
import gi

gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg  # noqa: E402
from PIL import Image  # noqa: E402


DEFAULT_PAPIRUS = "/usr/share/icons/Papirus"
DEFAULT_MAC_BASE = "/usr/share/icons/MacTahoe"
DEFAULT_MAC_DARK = "/usr/share/icons/MacTahoe-dark"
DEFAULT_MAC_LIGHT = "/usr/share/icons/MacTahoe-light"
DEFAULT_EXTRA_HICOLOR = (
    "/usr/share/icons/hicolor",
    "/var/lib/flatpak/exports/share/icons/hicolor",
    os.path.expanduser("~/.local/share/icons/hicolor"),
)

HICOLOR_TIERS: tuple[tuple[str, str], ...] = (
    ("scalable", ".svg"),
    ("256x256", ".svg"),
    ("128x128", ".svg"),
    ("64x64", ".svg"),
    ("512x512", ".svg"),
)

SKIP_APP_SUBDIRS = {"apps/16", "apps/22", "apps/32"}
NON_APP_LINKS = (
    "actions",
    "animations",
    "categories",
    "cursors",
    "cursors_scalable",
    "devices",
    "emblems",
    "emotes",
    "mimes",
    "preferences",
    "status",
)

# Icons whose body is naturally a screen, page, or console tile in the reference.
KEEP_TILE_STEMS = {
    "file-manager",
    "system-file-manager",
    "org.gnome.Nautilus",
    "nemo",
    "thunar",
    "dolphin",
    "terminal",
    "utilities-terminal",
    "org.gnome.Terminal",
    "org.gnome.Ptyxis",
    "org.gnome.Console",
    "kitty",
    "alacritty",
    "tilix",
    "office-calendar",
    "org.gnome.Calendar",
    "gnome-calendar",
    "calendar",
    "utilities-system-monitor",
    "org.gnome.SystemMonitor",
    "net.nokyan.Resources",
    "htop",
    "btop",
}

_SVG_TAG_RE = re.compile(r"<svg([^>]*)>(.*)</svg>", re.S | re.I)
_ATTR_RE = re.compile(r'([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')
_NUM_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)")
_SKIP_INNER_ATTRS = {"xmlns", "width", "height", "viewbox", "x", "y", "id"}

PLATE_RECT_RE = re.compile(
    r'<rect\b([^>]*\bwidth="(?:56(?:\.002)?|55\.[0-9]+|52(?:\.0)?|14\.817|14\.022)"[^>]*'
    r'\bheight="(?:56(?:\.002)?|55\.[0-9]+|52(?:\.0)?|14\.817|14\.022)"[^>]*)/>',
    re.S,
)
PLATE_PATH_RE = re.compile(
    r'<path\b([^>]*\bd="M\s*(?:20\.26[\s,]4|17\.00[12][\s,](?:4|3\.9)|47[\s,]3\.[89]|'
    r'18[\s,]4C10\.244|10\.583[\s,]1\.058|5\.36[\s,]1\.058|4\.37[\s,]\.53|4\.359[\s,]\.794|'
    r'8[\s,][45][\s,]C[\s,]8[\s,][45][\s,]4[\s,][45]|7[\s,][34][\s,]C[\s,]5\.338|'
    r'6\.8008[\s,]6[\s,]C|4[\s,]57[\s,](?:0[\s,]1|v1))[^"]*"[^>]*)/>',
    re.S,
)
OUTER_IMG_RE = re.compile(
    r'(?:<image\b[^>]*(?:width="(?:60\.882|59\.733|61\.[0-9]+|62\.[0-9]+|16\.108|16\.602|'
    r'15\.875|14\.287)"|x="(?:1\.559|2\.133|0\.412|\.165|1\.323)")[^>]*/>|'
    r'<path\b[^>]*\bd="M1\.559\s+2h60\.882v62\.001H1\.559z"[^>]*/>)',
    re.S,
)


# ---------------------------------------------------------------------------
# Bespoke Reference 3D SVGs (matching media_1795015352862_9c90df7f.jpg)
# ---------------------------------------------------------------------------

def _drop_shadow_defs(fid: str = "ds") -> str:
    return (
        f'<filter id="{fid}" x="-20%" y="-20%" width="140%" height="145%" '
        f'color-interpolation-filters="sRGB">'
        f'<feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.32"/>'
        f'</filter>'
    )


def svg_finder() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="fl" x1="20" y1="6" x2="20" y2="58" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#35b7ff"/>
    <stop offset="1" stop-color="#1470f2"/>
  </linearGradient>
  <linearGradient id="fr" x1="44" y1="6" x2="44" y2="58" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#e3f1ff"/>
    <stop offset="1" stop-color="#bdd8fa"/>
  </linearGradient>
  <clipPath id="fcp">
    <rect x="6" y="6" width="52" height="52" rx="12.5"/>
  </clipPath>
</defs>
<g filter="url(#ds)">
  <g clip-path="url(#fcp)">
    <rect x="6" y="6" width="52" height="52" rx="12.5" fill="url(#fr)"/>
    <path d="M6 6h28.5c-2.2 12-4.6 22-4.6 29.5h4.2c-.3 8.5.7 15.8 2.4 22.5H6V6z" fill="url(#fl)"/>
    <path d="M34.5 6c-2.2 12-4.6 22-4.6 29.5h4.2c-.3 8.5.7 15.8 2.4 22.5" fill="none" stroke="#1b4f9c" stroke-opacity="0.28" stroke-width="1.2"/>
  </g>
  <rect x="6.5" y="6.5" width="51" height="51" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.32" stroke-width="1"/>
  <ellipse cx="21.5" cy="24.5" rx="2.1" ry="3.6" fill="#1b2638"/>
  <ellipse cx="43.0" cy="24.5" rx="2.1" ry="3.6" fill="#1b2638"/>
  <path d="M19.5 41.5c6.5 6.2 18.5 6.2 25 0" fill="none" stroke="#1b2638" stroke-width="2.6" stroke-linecap="round"/>
</g>
</svg>"""


def svg_app_store() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="bg" x1="32" y1="5" x2="32" y2="59" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#37b8ff"/>
    <stop offset="1" stop-color="#0066eb"/>
  </linearGradient>
  <linearGradient id="bar" x1="32" y1="14" x2="32" y2="48" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#dceeff"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <circle cx="32" cy="32" r="27" fill="url(#bg)"/>
  <circle cx="32" cy="32" r="26.4" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1"/>
  <g fill="url(#bar)">
    <rect x="29.3" y="13.5" width="5.4" height="33.5" rx="2.7" transform="rotate(24 32 16)"/>
    <rect x="29.3" y="13.5" width="5.4" height="33.5" rx="2.7" transform="rotate(-24 32 16)"/>
    <rect x="16.5" y="34.2" width="31" height="5.4" rx="2.7"/>
  </g>
</g>
</svg>"""


def svg_camera() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="cb" x1="32" y1="14" x2="32" y2="52" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#e3e7ee"/>
    <stop offset="1" stop-color="#9ca3b0"/>
  </linearGradient>
  <linearGradient id="ring" x1="32" y1="20" x2="32" y2="48" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#4e5460"/>
    <stop offset="1" stop-color="#1e2229"/>
  </linearGradient>
  <radialGradient id="lens" cx="30" cy="32" r="11" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#3a88e8"/>
    <stop offset="0.45" stop-color="#143264"/>
    <stop offset="1" stop-color="#091120"/>
  </radialGradient>
</defs>
<g filter="url(#ds)">
  <rect x="13" y="12" width="10" height="4" rx="1.8" fill="#8b929e"/>
  <path d="M23 11.5h18l3.2 4.5H19.8z" fill="#d0d6e0"/>
  <rect x="7" y="15" width="50" height="37" rx="9" fill="url(#cb)"/>
  <rect x="7.5" y="15.5" width="49" height="36" rx="8.5" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1"/>
  <circle cx="32" cy="34" r="13.5" fill="url(#ring)"/>
  <circle cx="32" cy="34" r="10.2" fill="url(#lens)"/>
  <circle cx="32" cy="34" r="4.5" fill="#070c16" fill-opacity="0.7"/>
  <circle cx="28.5" cy="30.5" r="2.3" fill="#8fd0ff" fill-opacity="0.65"/>
  <circle cx="48.5" cy="21.5" r="2.2" fill="#3a404c"/>
</g>
</svg>"""


def svg_trash_can() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="tb" x1="16" y1="14" x2="48" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#eef2f8"/>
    <stop offset="0.5" stop-color="#cfd6e3"/>
    <stop offset="1" stop-color="#9aa3b5"/>
  </linearGradient>
  <linearGradient id="ti" x1="32" y1="9" x2="32" y2="17" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7c8596"/>
    <stop offset="1" stop-color="#aab3c4"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path d="M14 13.5 18.5 53a5 5 0 0 0 5 4.5h17a5 5 0 0 0 5-4.5L50 13.5H14z" fill="url(#tb)"/>
  <ellipse cx="32" cy="13.5" rx="18" ry="4.2" fill="url(#ti)" stroke="#f5f8fc" stroke-width="1.3"/>
  <g fill="#616b7d" fill-opacity="0.78">
    <path d="M30.2 24.5h3.6l2.5 4.3-1.8 1-1.3-2.2-1.8 3.1-2.2-1.3 1-4.9z"/>
    <path d="M27.5 27.2 31 29.2l-1.5 2.6-3.5-2z"/>
    <path d="M38.5 32.5 41 37l-1.9 3.2h-5.2v-2.2h3.5l1.1-1.9-2.2-3.6z"/>
    <path d="M34.2 38.8l2.5-2.5 1.5 1.5-2.5 2.5z"/>
    <path d="M23 36.8 25.5 32.5l2.2 1.3-1.8 3.2 1.2 2h3.8v2.2h-5.2z"/>
  </g>
</g>
</svg>"""


def svg_notes() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="paper" x1="30" y1="8" x2="30" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#e7ebf0"/>
  </linearGradient>
  <linearGradient id="pen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#48b2ff"/>
    <stop offset="0.5" stop-color="#1479f2"/>
    <stop offset="1" stop-color="#0a52b8"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path d="M15 8h30a6 6 0 0 1 6 6v31l-11 11H15a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z" fill="url(#paper)"/>
  <path d="M40 56V48a3 3 0 0 1 3-3h8z" fill="#cfd6e0"/>
  <g stroke="#c8d0dc" stroke-width="1.8" stroke-linecap="round">
    <line x1="15" y1="18" x2="43" y2="18"/>
    <line x1="15" y1="25" x2="43" y2="25"/>
    <line x1="15" y1="32" x2="41" y2="32"/>
    <line x1="15" y1="39" x2="38" y2="39"/>
    <line x1="15" y1="46" x2="33" y2="46"/>
  </g>
  <g transform="translate(41 29) rotate(32)">
    <rect x="-3.4" y="-21" width="6.8" height="32" rx="2.2" fill="url(#pen)"/>
    <rect x="-3.4" y="-21" width="6.8" height="4.2" rx="1.6" fill="#7fd0ff"/>
    <polygon points="-3.4,11 3.4,11 0,18.5" fill="#9ec9f5"/>
    <polygon points="-1.3,15.5 1.3,15.5 0,18.5" fill="#1b2432"/>
  </g>
</g>
</svg>"""


def svg_calculator() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="case" x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#d8dce3"/>
    <stop offset="1" stop-color="#8e95a2"/>
  </linearGradient>
  <linearGradient id="face" x1="32" y1="9" x2="32" y2="55" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#353840"/>
    <stop offset="1" stop-color="#1f2127"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <rect x="12" y="6" width="40" height="52" rx="10" fill="url(#case)"/>
  <rect x="14.5" y="8.5" width="35" height="47" rx="8" fill="url(#face)"/>
  <rect x="18" y="12.5" width="28" height="10" rx="3.2" fill="#17191d"/>
  <g fill="#e9edf2">
    <circle cx="21.5" cy="30" r="3.4"/>
    <circle cx="32" cy="30" r="3.4"/>
    <circle cx="21.5" cy="39" r="3.4"/>
    <circle cx="32" cy="39" r="3.4"/>
    <circle cx="21.5" cy="48" r="3.4"/>
    <circle cx="32" cy="48" r="3.4"/>
  </g>
  <g fill="#ff9f1c">
    <circle cx="42.5" cy="30" r="3.4"/>
    <circle cx="42.5" cy="39" r="3.4"/>
    <circle cx="42.5" cy="48" r="3.4"/>
  </g>
</g>
</svg>"""


def svg_calendar() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="body" x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#e3e7ee"/>
  </linearGradient>
  <linearGradient id="top" x1="32" y1="8" x2="32" y2="23" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff5e57"/>
    <stop offset="1" stop-color="#e0312b"/>
  </linearGradient>
  <clipPath id="cp">
    <rect x="8" y="8" width="48" height="48" rx="11"/>
  </clipPath>
</defs>
<g filter="url(#ds)">
  <g clip-path="url(#cp)">
    <rect x="8" y="8" width="48" height="48" rx="11" fill="url(#body)"/>
    <rect x="8" y="8" width="48" height="15" fill="url(#top)"/>
  </g>
  <text x="32" y="19" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="9.5" fill="#ffffff" letter-spacing="0.8">JUL</text>
  <text x="32" y="47" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="25" fill="#23262d">17</text>
</g>
</svg>"""


def svg_clock() -> str:
    ticks = []
    for i in range(12):
        ang = math.radians(i * 30)
        r1 = 21.5 if i % 3 == 0 else 22.8
        r2 = 24.3
        w = 1.6 if i % 3 == 0 else 1.0
        x1, y1 = 32 + r1 * math.sin(ang), 32 - r1 * math.cos(ang)
        x2, y2 = 32 + r2 * math.sin(ang), 32 - r2 * math.cos(ang)
        ticks.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="#2b2e36" stroke-width="{w}" stroke-linecap="round"/>')
    ticks_str = "".join(ticks)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="face" x1="32" y1="5" x2="32" y2="59" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#e5e9f0"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <circle cx="32" cy="32" r="27" fill="url(#face)"/>
  <circle cx="32" cy="32" r="26.3" fill="none" stroke="#cfd5e0" stroke-width="1"/>
  {ticks_str}
  <text x="32" y="15.5" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="5.5" fill="#23262d">12</text>
  <text x="50.5" y="34" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="5.5" fill="#23262d">3</text>
  <text x="32" y="52" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="5.5" fill="#23262d">6</text>
  <text x="13.5" y="34" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="5.5" fill="#23262d">9</text>
  <line x1="32" y1="32" x2="23" y2="23" stroke="#1f2229" stroke-width="2.6" stroke-linecap="round"/>
  <line x1="32" y1="32" x2="45" y2="22" stroke="#1f2229" stroke-width="2.1" stroke-linecap="round"/>
  <line x1="30" y1="29" x2="40" y2="47" stroke="#ff8800" stroke-width="1.3" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="2.2" fill="#1f2229"/>
  <circle cx="32" cy="32" r="1.0" fill="#ff8800"/>
</g>
</svg>"""


def svg_music() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="m" x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff7894"/>
    <stop offset="1" stop-color="#f0325e"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path fill="url(#m)" d="M48 9.5c1.9-.35 3.5 1.1 3.5 3v28.5c0 4.7-4.2 8.5-9.4 8.5-4.7 0-8.6-3.2-8.6-7.2s3.9-7.3 8.6-7.3c1.6 0 3.1.4 4.4 1.1V20.2L25 24.4v21.6c0 4.7-4.2 8.5-9.4 8.5-4.7 0-8.6-3.2-8.6-7.2s3.9-7.3 8.6-7.3c1.6 0 3.1.4 4.4 1.1V17.6c0-1.9 1.3-3.5 3.2-3.9L48 9.5z"/>
</g>
</svg>"""


def svg_videos() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="v" x1="16" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#a566ff"/>
    <stop offset="1" stop-color="#5e24e6"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path fill="url(#v)" d="M13 14.5c0-4.8 5.2-7.8 9.4-5.4l30.2 17.5c4.1 2.4 4.1 8.4 0 10.8L22.4 54.9c-4.2 2.4-9.4-.6-9.4-5.4v-35z"/>
  <path fill="#ffffff" fill-opacity="0.92" d="M23.5 23.5c0-1.7 1.8-2.8 3.3-1.9l14.5 8.5c1.5.9 1.5 3.0 0 3.9l-14.5 8.5c-1.5.9-3.3-.2-3.3-1.9v-17.1z"/>
</g>
</svg>"""


def svg_photos() -> str:
    colors = [
        "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
        "#5ac8fa", "#007aff", "#5856d6", "#ff2d55",
    ]
    petals_bg = []
    petals_fg = []
    for i, col in enumerate(colors):
        ang = i * 45
        petals_bg.append(
            f'<rect x="23" y="5" width="18" height="27" rx="9" fill="#ffffff" transform="rotate({ang} 32 32)"/>'
        )
        petals_fg.append(
            f'<rect x="24.5" y="7" width="15" height="24" rx="7.5" fill="{col}" fill-opacity="0.86" transform="rotate({ang} 32 32)"/>'
        )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>{_drop_shadow_defs("ds")}</defs>
<g filter="url(#ds)">
  {''.join(petals_bg)}
  {''.join(petals_fg)}
  <circle cx="32" cy="32" r="3.2" fill="#ffffff" fill-opacity="0.65"/>
</g>
</svg>"""


def svg_system_monitor() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="rim" x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#454a54"/>
    <stop offset="1" stop-color="#22252b"/>
  </linearGradient>
  <linearGradient id="scr" x1="32" y1="11" x2="32" y2="53" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#17231e"/>
    <stop offset="1" stop-color="#0d1512"/>
  </linearGradient>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="1.4" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<g filter="url(#ds)">
  <rect x="7" y="8" width="50" height="48" rx="11" fill="url(#rim)"/>
  <rect x="10" y="11" width="44" height="42" rx="8.5" fill="url(#scr)"/>
  <path d="M11 34h10l3.2-10 4.2 19 4.5-24 4.2 21 3.1-9 2.8 3H53" fill="none" stroke="#2ee878" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
</g>
</svg>"""


def svg_bluetooth() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="bt" x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#40b8ff"/>
    <stop offset="1" stop-color="#0062e6"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path d="M18 20.5 44 43l-13 12.5V8.5L44 21 18 43.5" fill="none" stroke="url(#bt)" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>"""


def svg_wifi() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="wf" x1="32" y1="12" x2="32" y2="52" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#49c4ff"/>
    <stop offset="1" stop-color="#006eeb"/>
  </linearGradient>
</defs>
<g filter="url(#ds)" stroke="url(#wf)" stroke-width="5.8" stroke-linecap="round" fill="none">
  <path d="M7 24.5a35 35 0 0 1 50 0"/>
  <path d="M14.5 33.5a24 24 0 0 1 35 0"/>
  <path d="M22.5 42.5a13 13 0 0 1 19 0"/>
  <circle cx="32" cy="50.5" r="3.4" fill="url(#wf)" stroke="none"/>
</g>
</svg>"""


def svg_display() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="scr" x1="10" y1="10" x2="54" y2="44" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#47c2ff"/>
    <stop offset="1" stop-color="#1d56f0"/>
  </linearGradient>
  <linearGradient id="st" x1="32" y1="44" x2="32" y2="56" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#d8dde6"/>
    <stop offset="1" stop-color="#969fab"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path d="M26 43h12l2 10H24z" fill="url(#st)"/>
  <rect x="19" y="52" width="26" height="3.2" rx="1.6" fill="#b7c0cc"/>
  <rect x="6" y="9" width="52" height="36" rx="5.5" fill="url(#scr)"/>
  <rect x="6.5" y="9.5" width="51" height="35" rx="5" fill="none" stroke="#ffffff" stroke-opacity="0.32" stroke-width="1"/>
</g>
</svg>"""


def svg_search() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="rim" x1="10" y1="10" x2="46" y2="46" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#f2f5f8"/>
    <stop offset="1" stop-color="#9aa3b0"/>
  </linearGradient>
  <radialGradient id="glass" cx="25" cy="24" r="16" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#5899e2" stop-opacity="0.72"/>
    <stop offset="1" stop-color="#1e3b70" stop-opacity="0.88"/>
  </radialGradient>
</defs>
<g filter="url(#ds)">
  <line x1="39" y1="39" x2="54" y2="54" stroke="url(#rim)" stroke-width="6.5" stroke-linecap="round"/>
  <circle cx="27" cy="27" r="17" fill="url(#glass)" stroke="url(#rim)" stroke-width="4.5"/>
  <path d="M17 20a12 12 0 0 1 16-4" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2.2" stroke-linecap="round"/>
</g>
</svg>"""


def svg_maps() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <clipPath id="pin">
    <path d="M32 6C20.4 6 11 15.4 11 27c0 14.2 17.8 29.3 19.6 30.8a2.2 2.2 0 0 0 2.8 0C35.2 56.3 53 41.2 53 27 53 15.4 43.6 6 32 6z"/>
  </clipPath>
</defs>
<g filter="url(#ds)">
  <g clip-path="url(#pin)">
    <path d="M11 6h21v21H11z" fill="#ea4335"/>
    <path d="M32 6h21v21H32z" fill="#4285f4"/>
    <path d="M11 27h21v32H11z" fill="#fbbc04"/>
    <path d="M32 27h21v32H32z" fill="#34a853"/>
    <polygon points="11,34 32,20 53,6 53,22 25,44 11,44" fill="#fbbc04"/>
    <polygon points="24,59 35,28 53,20 53,59" fill="#34a853"/>
  </g>
  <circle cx="32" cy="26.5" r="8.2" fill="#1e2433"/>
</g>
</svg>"""


def svg_cloud() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="cl" x1="32" y1="14" x2="32" y2="50" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#63ccff"/>
    <stop offset="1" stop-color="#1872f0"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path fill="url(#cl)" d="M20 49h26.5a11.5 11.5 0 0 0 1.4-22.9A15.5 15.5 0 0 0 18.2 22a13.5 13.5 0 0 0 1.8 27z"/>
</g>
</svg>"""


def svg_prompt_green() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="bg" x1="32" y1="7" x2="32" y2="57" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#353a42"/>
    <stop offset="1" stop-color="#181b20"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <rect x="7" y="7" width="50" height="50" rx="12" fill="url(#bg)"/>
  <path d="M33 21 44 32 33 43" fill="none" stroke="#252a32" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 21 32 32 21 43" fill="none" stroke="#30e875" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>"""


def svg_sliders() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="bar" x1="32" y1="12" x2="32" y2="52" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#eef2f7"/>
    <stop offset="1" stop-color="#aeb7c4"/>
  </linearGradient>
</defs>
<g filter="url(#ds)" fill="url(#bar)">
  <rect x="8" y="16" width="48" height="4.5" rx="2.25"/>
  <circle cx="42" cy="18.25" r="5.6"/>
  <rect x="8" y="29.75" width="48" height="4.5" rx="2.25"/>
  <circle cx="23" cy="32" r="5.6"/>
  <rect x="8" y="43.5" width="48" height="4.5" rx="2.25"/>
  <circle cx="35" cy="45.75" r="5.6"/>
</g>
</svg>"""


def svg_app_folder() -> str:
    return svg_colored_folder("#38b0ff", "#0e68e8", "#2d93eb", "#0b54c4", "app")


def svg_colored_folder(
    front_top: str,
    front_bot: str,
    back_top: str,
    back_bot: str,
    glyph: str,
) -> str:
    glyphs = {
        "home": '<path fill="#073b8c" fill-opacity="0.52" d="M32 26 20 35.5h3.5V46h6v-6.5h5V46h6V35.5H44L32 26z"/>',
        "desktop": '<g fill="#054e73" fill-opacity="0.52"><rect x="21" y="26.5" width="22" height="14.5" rx="2.2"/><path d="M28 41h8l1.5 3.5h-11z"/><rect x="24.5" y="44.5" width="15" height="1.8" rx="0.9"/></g>',
        "documents": '<path fill="#ffffff" fill-opacity="0.78" d="M24 25h11l5 5v15a2 2 0 0 1-2 2H24a2 2 0 0 1-2-2V27a2 2 0 0 1 2-2zm10.5 1.8V31h4.2L34.5 26.8zM25.5 34h13v1.8h-13zm0 4h13v1.8h-13zm0 4h9v1.8h-9z"/>',
        "download": '<path fill="#0b4f1c" fill-opacity="0.52" d="M29.5 25.5h5v10h4.5L32 42.5 25 35.5h4.5v-10zm-7.5 19h20v2.6H22v-2.6z"/>',
        "pictures": '<g fill="#ffffff" fill-opacity="0.78"><rect x="21" y="26" width="22" height="19" rx="2.5" fill="none" stroke="#ffffff" stroke-opacity="0.78" stroke-width="2.2"/><circle cx="27" cy="31.5" r="2.2"/><path d="M22.5 43.5 29 36l4.5 4.5 3.5-3.5 4.5 6.5z"/></g>',
        "music": '<path fill="#ffffff" fill-opacity="0.82" d="M38 25.5v13.8a3.8 3.8 0 1 1-2.2-3.4v-7.6l-8.5 2v11a3.8 3.8 0 1 1-2.2-3.4V28.2l12.9-2.7z"/>',
        "videos": '<path fill="#ffffff" fill-opacity="0.85" d="M26 26.5c0-1.4 1.5-2.3 2.7-1.5l12.5 7.8c1.2.7 1.2 2.4 0 3.1L28.7 43.7c-1.2.8-2.7-.1-2.7-1.5V26.5z"/>',
        "public": '<g fill="#064e4a" fill-opacity="0.55"><circle cx="28" cy="31" r="3.5"/><path d="M21.5 43.5c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6z"/><circle cx="37.5" cy="32.5" r="2.8"/><path d="M33.5 43.5c.3-2.6 2.4-4.5 5.2-4.5 2.9 0 5.3 2 5.3 4.5z"/></g>',
        "code": '<path d="M27 30.5 21.5 36l5.5 5.5M37 30.5 42.5 36 37 41.5M34 28.5l-4 15" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
        "package": '<path fill="#073b8c" fill-opacity="0.52" d="M32 25 21 30.2v11.6L32 47l11-5.2V30.2L32 25zm0 2.5 7.8 3.7L32 34.9l-7.8-3.7L32 27.5zm-8.8 5.6 7.7 3.7v7.4l-7.7-3.7v-7.4zm17.6 0v7.4l-7.7 3.7v-7.4l7.7-3.7z"/>',
        "app": '<g fill="none" stroke="#ffffff" stroke-opacity="0.88" stroke-width="3.6" stroke-linecap="round"><path d="M32 26.5 24 44.5"/><path d="M32 26.5 40 44.5"/><path d="M22.5 40h19"/></g>',
        "none": "",
    }
    g_svg = glyphs.get(glyph, "")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="bk" x1="32" y1="10" x2="32" y2="26" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="{back_top}"/>
    <stop offset="1" stop-color="{back_bot}"/>
  </linearGradient>
  <linearGradient id="fr" x1="32" y1="18" x2="32" y2="54" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="{front_top}"/>
    <stop offset="1" stop-color="{front_bot}"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path fill="url(#bk)" d="M10 11h14.5c2.2 0 3.2.6 4.5 2.4 1.1 1.5 2.4 1.8 4.8 1.8H54a4.5 4.5 0 0 1 4.5 4.5v28A4.5 4.5 0 0 1 54 52.2H10a4.5 4.5 0 0 1-4.5-4.5V15.5A4.5 4.5 0 0 1 10 11z"/>
  <rect x="8.5" y="16" width="47" height="30" rx="3" fill="#ffffff" fill-opacity="0.88"/>
  <rect x="5.5" y="18.5" width="53" height="35" rx="5" fill="url(#fr)"/>
  <path fill="#ffffff" fill-opacity="0.28" d="M10.5 18.5h43a5 5 0 0 1 5 5v1a5 5 0 0 0-5-5h-43a5 5 0 0 0-5 5v-1a5 5 0 0 1 5-5z"/>
  {g_svg}
</g>
</svg>"""


def svg_puzzle_extensions() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs>
  {_drop_shadow_defs("ds")}
  <linearGradient id="pz" x1="32" y1="8" x2="32" y2="54" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#f2f6fc"/>
    <stop offset="1" stop-color="#b9c4d6"/>
  </linearGradient>
</defs>
<g filter="url(#ds)">
  <path fill="url(#pz)" d="M31 8a5.8 5.8 0 0 0-5.8 5.8c0 1.6.7 3 1.7 4.1H15.5a3.5 3.5 0 0 0-3.5 3.5V31h1.5a5.8 5.8 0 0 1 5.8 5.8 5.8 5.8 0 0 1-5.8 5.8H12v9.9a3.5 3.5 0 0 0 3.5 3.5h10.8v-1.5a5.8 5.8 0 0 1 5.8-5.8 5.8 5.8 0 0 1 5.8 5.8V56h9.6a3.5 3.5 0 0 0 3.5-3.5V41.1c1.1 1 2.5 1.7 4.1 1.7a5.8 5.8 0 0 0 5.8-5.8 5.8 5.8 0 0 0-5.8-5.8c-1.6 0-3 .7-4.1 1.7V21.4a3.5 3.5 0 0 0-3.5-3.5H35.1c1-1.1 1.7-2.5 1.7-4.1A5.8 5.8 0 0 0 31 8z"/>
</g>
</svg>"""


BESPOKE_APPS: dict[str, callable] = {
    # Finder / File Manager
    "org.gnome.Nautilus": svg_finder,
    "org.gnome.nautilus": svg_finder,
    "nautilus": svg_finder,
    "file-manager": svg_finder,
    "system-file-manager": svg_finder,
    "user-file-manager": svg_finder,
    "nemo": svg_finder,
    "thunar": svg_finder,
    "dolphin": svg_finder,
    # App Store / Software
    "org.gnome.Software": svg_app_store,
    "gnome-software": svg_app_store,
    "system-software-install": svg_app_store,
    "appstore": svg_app_store,
    # Camera
    "camera-photo": svg_camera,
    "org.gnome.Snapshot": svg_camera,
    "org.gnome.Cheese": svg_camera,
    "cheese": svg_camera,
    "camera": svg_camera,
    "accessories-camera": svg_camera,
    "camera-app": svg_camera,
    # Trash
    "user-trash": svg_trash_can,
    "user-trash-full": svg_trash_can,
    "emptytrash": svg_trash_can,
    # Extensions (Frosted 3D Silver Puzzle)
    "extensions": svg_puzzle_extensions,
    "gnome-extensions": svg_puzzle_extensions,
    "org.gnome.Extensions": svg_puzzle_extensions,
    "org.gnome.Shell.Extensions": svg_puzzle_extensions,
    "com.mattjakeman.ExtensionManager": svg_puzzle_extensions,
    # Notes / Text Editor
    "accessories-text-editor": svg_notes,
    "org.gnome.TextEditor": svg_notes,
    "org.gnome.Notes": svg_notes,
    "bijiben": svg_notes,
    "tomboy": svg_notes,
    "gnote": svg_notes,
    "text-editor": svg_notes,
    "gedit": svg_notes,
    "org.gnome.gedit": svg_notes,
    "notes": svg_notes,
    "accessories-notes": svg_notes,
    # Calculator
    "calc": svg_calculator,
    "calculator": svg_calculator,
    "gnome-calculator": svg_calculator,
    "org.gnome.Calculator": svg_calculator,
    "accessories-calculator": svg_calculator,
    "pcbcalculator": svg_calculator,
    # Calendar
    "office-calendar": svg_calendar,
    "org.gnome.Calendar": svg_calendar,
    "gnome-calendar": svg_calendar,
    "calendar": svg_calendar,
    # Clock
    "preferences-system-time": svg_clock,
    "org.gnome.clocks": svg_clock,
    "gnome-clocks": svg_clock,
    "clock": svg_clock,
    "clocks": svg_clock,
    "accessories-clock": svg_clock,
    # Music
    "apple-music": svg_music,
    "org.gnome.Music": svg_music,
    "gnome-music": svg_music,
    "rhythmbox": svg_music,
    "org.gnome.Lollypop": svg_music,
    "g4music": svg_music,
    "com.github.neithern.g4music": svg_music,
    "amberol": svg_music,
    "io.bassi.Amberol": svg_music,
    "multimedia-audio-player": svg_music,
    # Videos
    "org.gnome.Totem": svg_videos,
    "totem": svg_videos,
    "multimedia-video-player": svg_videos,
    "videos": svg_videos,
    "io.github.celluloid_player.Celluloid": svg_videos,
    # Photos
    "eog": svg_photos,
    "org.gnome.eog": svg_photos,
    "org.gnome.Loupe": svg_photos,
    "org.gnome.Photos": svg_photos,
    "org.gnome.Shotwell": svg_photos,
    "photos": svg_photos,
    "multimedia-photo-viewer": svg_photos,
    # System Monitor
    "utilities-system-monitor": svg_system_monitor,
    "org.gnome.SystemMonitor": svg_system_monitor,
    "gnome-system-monitor": svg_system_monitor,
    "net.nokyan.Resources": svg_system_monitor,
    # Bluetooth
    "bluetooth": svg_bluetooth,
    "preferences-system-bluetooth": svg_bluetooth,
    "blueman": svg_bluetooth,
    "org.dualbt.DualAudioHub": svg_bluetooth,
    # Wi-Fi / Network
    "preferences-system-network": svg_wifi,
    "network-wireless": svg_wifi,
    "nm-device-wireless": svg_wifi,
    "nm-connection-editor": svg_wifi,
    "wifi-hotspot-router": svg_wifi,
    # Display / Monitor
    "preferences-desktop-display": svg_display,
    "video-display": svg_display,
    "display": svg_display,
    "computer": svg_display,
    # Applications Folder
    "applications-other": svg_app_folder,
    "folder-applications": svg_app_folder,
    "system-installer": svg_app_folder,
    # Search
    "preferences-system-search": svg_search,
    "system-search": svg_search,
    "catfish": svg_search,
    # Maps
    "org.gnome.Maps": svg_maps,
    "gnome-maps": svg_maps,
    "google-maps": svg_maps,
    "maps": svg_maps,
    # Weather / Cloud
    "org.gnome.Weather": svg_cloud,
    "gnome-weather": svg_cloud,
    "indicator-weather": svg_cloud,
    # Prompt Green
    "utilities-terminal_su": svg_prompt_green,
    "org.gnome.Prompt": svg_prompt_green,
    # Tweaks / Sliders
    "org.gnome.tweaks": svg_sliders,
    "gnome-tweak-tool": svg_sliders,
    "preferences-other": svg_sliders,
    "ca.desrt.dconf-editor": svg_sliders,
    "dconf-editor": svg_sliders,
}

# Direct free-standing 3D device/place SVGs already inside MacTahoe without squares.
DIRECT_MACTAHOE_FILES: dict[str, str] = {
    "org.gnome.Settings": "apps/scalable/preferences-system.svg",
    "gnome-control-center": "apps/scalable/preferences-system.svg",
    "drive-harddisk": "devices/scalable/drive-harddisk.svg",
    "org.gnome.DiskUtility": "devices/scalable/drive-harddisk.svg",
    "gnome-disks": "devices/scalable/drive-harddisk.svg",
    "baobab": "devices/scalable/drive-harddisk.svg",
    "org.gnome.baobab": "devices/scalable/drive-harddisk.svg",
}

# Row-4 colorful 3D macOS folders for places/scalable.
COLORED_PLACES_FOLDERS: dict[str, tuple[str, str, str, str, str]] = {
    "user-home": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "home"),
    "folder-home": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "home"),
    "user-desktop": ("#45deff", "#0ca4e8", "#30bfe6", "#0882bd", "desktop"),
    "folder-desktop": ("#45deff", "#0ca4e8", "#30bfe6", "#0882bd", "desktop"),
    "desktop": ("#45deff", "#0ca4e8", "#30bfe6", "#0882bd", "desktop"),
    "folder-documents": ("#4eb8ff", "#1475f0", "#389be6", "#0e5cc4", "documents"),
    "folder-text": ("#4eb8ff", "#1475f0", "#389be6", "#0e5cc4", "documents"),
    "folder-download": ("#5ae06e", "#1cb83a", "#44c458", "#14942d", "download"),
    "folder-downloads": ("#5ae06e", "#1cb83a", "#44c458", "#14942d", "download"),
    "folder_download": ("#5ae06e", "#1cb83a", "#44c458", "#14942d", "download"),
    "folder_downloads": ("#5ae06e", "#1cb83a", "#44c458", "#14942d", "download"),
    "folder-pictures": ("#a66bff", "#6c32e6", "#8c52e6", "#5422bd", "pictures"),
    "folder-images": ("#a66bff", "#6c32e6", "#8c52e6", "#5422bd", "pictures"),
    "folder_pictures": ("#a66bff", "#6c32e6", "#8c52e6", "#5422bd", "pictures"),
    "folder_images": ("#a66bff", "#6c32e6", "#8c52e6", "#5422bd", "pictures"),
    "folder-music": ("#ff6e8e", "#e6355e", "#e65575", "#bd2448", "music"),
    "folder-sound": ("#ff6e8e", "#e6355e", "#e65575", "#bd2448", "music"),
    "folder-videos": ("#ffb038", "#e86e08", "#e69622", "#bd5604", "videos"),
    "folder-video": ("#ffb038", "#e86e08", "#e69622", "#bd5604", "videos"),
    "folder-publicshare": ("#36dcd2", "#0ea098", "#28bfb6", "#0a7d76", "public"),
    "folder-public": ("#36dcd2", "#0ea098", "#28bfb6", "#0a7d76", "public"),
    "folder-code": ("#a8e446", "#6cb816", "#8ec732", "#54940e", "code"),
    "folder-development": ("#a8e446", "#6cb816", "#8ec732", "#54940e", "code"),
    "folder-git": ("#a8e446", "#6cb816", "#8ec732", "#54940e", "code"),
    "folder-tar": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "package"),
    "folder-deb": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "package"),
    "folder-rpm": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "package"),
    "folder-templates": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "package"),
    "folder": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "none"),
    "inode-directory": ("#38a8ff", "#0c65e8", "#2d8de6", "#0950bd", "none"),
}


# ---------------------------------------------------------------------------
# SVG Rendering, Analysis & Background-Square Stripping
# ---------------------------------------------------------------------------

def render_svg_image(svg_bytes: bytes, size: int = 64) -> Image.Image | None:
    """Rasterize SVG bytes into a square RGBA PIL image using librsvg."""
    try:
        handle = Rsvg.Handle.new_from_data(svg_bytes)
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
        ctx = cairo.Context(surf)
        vp = Rsvg.Rectangle()
        vp.x = vp.y = 0
        vp.width = vp.height = size
        if not handle.render_document(ctx, vp):
            return None
        return Image.frombuffer("RGBA", (size, size), surf.get_data(), "raw", "BGRA", 0, 1).copy()
    except Exception:
        return None


def _extract_fill(attr_str: str) -> str | None:
    m = re.search(r'\bfill="([^"]+)"', attr_str)
    if m and m.group(1) not in ("none", "transparent"):
        return m.group(1)
    m2 = re.search(r"fill:\s*([^;\"\s]+)", attr_str)
    if m2 and m2.group(1) not in ("none", "transparent"):
        return m2.group(1)
    return None


def _pixel_stats(im: Image.Image) -> tuple[int, tuple[int, int, int, int] | None, float, float, int]:
    """Return (opaque_count, bbox, mean_luma, mean_sat, corner_max_alpha)."""
    px = im.load()
    min_x, min_y, max_x, max_y = 64, 64, -1, -1
    count = 0
    luma_sum = sat_sum = 0.0
    for y in range(64):
        for x in range(64):
            r, g, b, a = px[x, y]
            if a <= 35:
                continue
            count += 1
            if x < min_x:
                min_x = x
            if x > max_x:
                max_x = x
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y
            mx, mn = max(r, g, b) / 255.0, min(r, g, b) / 255.0
            l = 0.5 * (mx + mn)
            d = 1.0 - abs(2.0 * l - 1.0)
            s = 0.0 if (mx == mn or d <= 1e-5) else (mx - mn) / d
            luma_sum += l
            sat_sum += s

    corners = [px[8, 8][3], px[55, 8][3], px[8, 55][3], px[55, 55][3]]
    c_alpha = sum(1 for c in corners if c > 45)
    if count == 0:
        return 0, None, 0.0, 0.0, c_alpha
    return count, (min_x, min_y, max_x + 1, max_y + 1), luma_sum / count, sat_sum / count, c_alpha


def _touches_squircle_walls(im: Image.Image) -> int:
    """Count how many of the 4 squircle boundary walls (x=5, x=58, y=5, y=58) have heavy opaque runs."""
    px = im.load()
    top = sum(1 for x in range(18, 46) if px[x, 5][3] > 140)
    bot = sum(1 for x in range(18, 46) if px[x, 58][3] > 140)
    left = sum(1 for y in range(18, 46) if px[5, y][3] > 140)
    right = sum(1 for y in range(18, 46) if px[58, y][3] > 140)
    return sum(1 for run in (top, bot, left, right) if run >= 14)


def _scale_inner_svg(svg_txt: str, bbox: tuple[int, int, int, int], add_shadow: bool = True) -> str:
    """Scale the un-squared SVG content around its center so it fills ~52x52 of the 64x64 canvas."""
    x0, y0, x1, y1 = bbox
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    max_dim = max(bw, bh)
    if max_dim >= 52:
        scale = 1.0
    else:
        scale = min(1.38, 52.0 / max_dim)

    m = _SVG_TAG_RE.search(svg_txt)
    if not m:
        return svg_txt
    attrs_raw, body = m.group(1), m.group(2)

    # Determine coordinate space from viewBox
    vb_m = re.search(r'\bviewBox="([^"]+)"', attrs_raw, re.I)
    if vb_m:
        parts = [float(x) for x in vb_m.group(1).replace(",", " ").split() if x]
        vw = parts[2] if len(parts) == 4 else 64.0
        vh = parts[3] if len(parts) == 4 else 64.0
    else:
        vw = vh = 64.0

    cx = ((x0 + x1) * 0.5 / 64.0) * vw
    cy = ((y0 + y1) * 0.5 / 64.0) * vh
    tx = (vw * 0.5) - cx * scale
    ty = (vh * 0.5) - cy * scale

    # Split <defs>...</defs> from drawing body so defs stay outside the scaled group
    defs_blocks: list[str] = []

    def _collect_defs(match: re.Match[str]) -> str:
        defs_blocks.append(match.group(0))
        return ""

    drawing_body = re.sub(r"<defs\b[^>]*>.*?</defs>", _collect_defs, body, flags=re.S | re.I)
    sh_def = ""
    sh_attr = ""
    if add_shadow:
        std_dev = 1.6 * (vw / 64.0)
        dy_val = 1.6 * (vh / 64.0)
        sh_def = (
            f'<defs><filter id="fg_nosq_ds" x="-25%" y="-25%" width="150%" height="155%" '
            f'color-interpolation-filters="sRGB">'
            f'<feDropShadow dx="0" dy="{dy_val:.3f}" stdDeviation="{std_dev:.3f}" '
            f'flood-color="#000000" flood-opacity="0.28"/>'
            f'</filter></defs>'
        )
        sh_attr = ' filter="url(#fg_nosq_ds)"'

    if abs(scale - 1.0) < 0.03 and abs(tx) < 0.5 * (vw / 64.0) and abs(ty) < 0.5 * (vh / 64.0):
        transform_attr = ""
    else:
        transform_attr = f' transform="translate({tx:.3f} {ty:.3f}) scale({scale:.4f})"'

    return f"<svg{attrs_raw}>{''.join(defs_blocks)}{sh_def}<g{transform_attr}{sh_attr}>{drawing_body}</g></svg>"


def strip_mactahoe_square(svg_txt: str, stem: str) -> str | None:
    """Remove the 56x56 / 14.817x14.817 background squircle plate from a MacTahoe SVG."""
    plate_fills: list[str] = []
    for m in PLATE_RECT_RE.finditer(svg_txt):
        f = _extract_fill(m.group(1))
        if f:
            plate_fills.append(f)
    for m in PLATE_PATH_RE.finditer(svg_txt):
        f = _extract_fill(m.group(1))
        if f:
            plate_fills.append(f)

    if not plate_fills:
        return None

    stripped = OUTER_IMG_RE.sub("", PLATE_PATH_RE.sub("", PLATE_RECT_RE.sub("", svg_txt)))
    im = render_svg_image(stripped.encode("utf-8"), 64)
    if im is None:
        return None

    count, bbox, luma, sat, occupied_corners = _pixel_stats(im)
    if count < 90 or bbox is None or occupied_corners >= 3:
        return None

    # Reject icons whose inner artwork was clipped hard against 2+ walls of the 56x56 square
    if _touches_squircle_walls(im) >= 2:
        return None

    # If the inner symbol was a white/pale knockout on a colored brand plate (except puzzle extensions),
    # transfer the plate's brand gradient onto the white symbol so it keeps its brand color.
    if stem not in ("extensions", "gnome-extensions", "org.gnome.Extensions") and luma > 0.80:
        orig_im = render_svg_image(svg_txt.encode("utf-8"), 64)
        if orig_im is not None:
            cr_r, cr_g, cr_b, cr_a = orig_im.getpixel((10, 10))
            if cr_a > 180:
                mx, mn = max(cr_r, cr_g, cr_b) / 255.0, min(cr_r, cr_g, cr_b) / 255.0
                c_luma = 0.5 * (mx + mn)
                c_denom = 1.0 - abs(2.0 * c_luma - 1.0)
                c_sat = 0.0 if (mx == mn or c_denom <= 1e-5) else (mx - mn) / c_denom
                if c_sat > 0.25 or c_luma < 0.65:
                    brand_fill = plate_fills[0]
                    m_svg = _SVG_TAG_RE.search(stripped)
                    if m_svg:
                        a_raw, b_raw = m_svg.group(1), m_svg.group(2)
                        # Replace white/pale fill on drawing elements (outside <defs>)
                        defs_list: list[str] = []
                        b_nodefs = re.sub(
                            r"<defs\b[^>]*>.*?</defs>",
                            lambda m: (defs_list.append(m.group(0)) or f"__DEFS_{len(defs_list)-1}__"),
                            b_raw,
                            flags=re.S | re.I,
                        )
                        b_recolored = re.sub(
                            r'\bfill="(?:#fff(?:fff)?|white|url\(#[^)]+\))"',
                            f'fill="{brand_fill}"',
                            b_nodefs,
                            flags=re.I,
                        )
                        b_recolored = re.sub(
                            r'\bstroke="(?:#fff(?:fff)?|#eee(?:eee)?|#f[0-9a-f]{5}|white)"',
                            f'stroke="{brand_fill}"',
                            b_recolored,
                            flags=re.I,
                        )
                        b_recolored = re.sub(
                            r"fill:\s*(?:#fff(?:fff)?|white)",
                            f"fill:{brand_fill}",
                            b_recolored,
                            flags=re.I,
                        )
                        b_recolored = re.sub(
                            r"stroke:\s*(?:#fff(?:fff)?|#eee(?:eee)?|white)",
                            f"stroke:{brand_fill}",
                            b_recolored,
                            flags=re.I,
                        )
                        for idx, d_blk in enumerate(defs_list):
                            b_recolored = b_recolored.replace(f"__DEFS_{idx}__", d_blk)
                        candidate = f"<svg{a_raw}>{b_recolored}</svg>"
                        cand_im = render_svg_image(candidate.encode("utf-8"), 64)
                        if cand_im is not None:
                            c_cnt, c_bbox, _, _, _ = _pixel_stats(cand_im)
                            if c_cnt >= count * 0.8 and c_bbox is not None:
                                stripped = candidate
                                bbox = c_bbox

    return _scale_inner_svg(stripped, bbox, add_shadow=True)


def process_one_app_icon(args: tuple[str, str, str, str, str]) -> tuple[bool, str]:
    """Process one app icon stem into dark_out and light_out."""
    stem, mac_src_str, pap_src_str, dark_out, light_out = args
    try:
        # 1. Bespoke reference 3D SVG
        if stem in BESPOKE_APPS:
            svg_out = BESPOKE_APPS[stem]()
            Path(dark_out).write_text(svg_out, encoding="utf-8")
            Path(light_out).write_text(svg_out, encoding="utf-8")
            return True, ""

        # 2. Direct or aliased MacTahoe SVG asset (stripped of any square plate)
        if stem in DIRECT_MACTAHOE_FILES:
            p = (Path(DEFAULT_MAC_BASE) / DIRECT_MACTAHOE_FILES[stem]).resolve()
            if p.is_file():
                raw_txt = p.read_text(encoding="utf-8", errors="replace")
                un_sq = strip_mactahoe_square(raw_txt, stem)
                svg_out = un_sq if un_sq is not None else raw_txt
                Path(dark_out).write_text(svg_out, encoding="utf-8")
                Path(light_out).write_text(svg_out, encoding="utf-8")
                return True, ""

        # 3. Natural screen/tile icons (Finder, Terminal, Calendar, System Monitor)
        if stem in KEEP_TILE_STEMS and mac_src_str and Path(mac_src_str).is_file():
            svg_out = Path(mac_src_str).read_text(encoding="utf-8", errors="replace")
            Path(dark_out).write_text(svg_out, encoding="utf-8")
            Path(light_out).write_text(svg_out, encoding="utf-8")
            return True, ""

        # 4. Try stripping the 56x56 square plate from MacTahoe's 3D icon
        if mac_src_str and Path(mac_src_str).is_file():
            mac_txt = Path(mac_src_str).read_text(encoding="utf-8", errors="replace")
            un_squared = strip_mactahoe_square(mac_txt, stem)
            if un_squared is not None:
                Path(dark_out).write_text(un_squared, encoding="utf-8")
                Path(light_out).write_text(un_squared, encoding="utf-8")
                return True, ""

        # 5. Fallback to Papirus / hicolor free-standing SVG (stripping any 56x56 square rect if present)
        if pap_src_str and Path(pap_src_str).is_file():
            pap_path = Path(pap_src_str)
            if pap_path.suffix.lower() == ".svg":
                pap_txt = pap_path.read_text(encoding="utf-8", errors="replace")
                un_sq_pap = strip_mactahoe_square(pap_txt, stem)
                out_txt = un_sq_pap if un_sq_pap is not None else pap_txt
                Path(dark_out).write_text(out_txt, encoding="utf-8")
                Path(light_out).write_text(out_txt, encoding="utf-8")
                return True, ""

        # 6. Final fallback to MacTahoe original
        if mac_src_str and Path(mac_src_str).is_file():
            mac_txt = Path(mac_src_str).read_text(encoding="utf-8", errors="replace")
            Path(dark_out).write_text(mac_txt, encoding="utf-8")
            Path(light_out).write_text(mac_txt, encoding="utf-8")
            return True, ""

        return False, f"No source for {stem}"
    except Exception as exc:
        return False, f"{stem}: {exc}"


def collect_app_catalog(
    mac_apps: Path, papirus_apps: Path, extra_hicolor_dirs: Iterable[Path]
) -> tuple[list[tuple[str, str, str]], list[tuple[str, str]]]:
    """Collect union of MacTahoe, Papirus, and hicolor app icons and symlinks."""
    mac_real: dict[str, Path] = {}
    mac_symlinks: dict[str, str] = {}
    if mac_apps.is_dir():
        for entry in sorted(mac_apps.iterdir(), key=lambda p: p.name):
            if not entry.name.endswith(".svg") or "symbolic" in entry.name:
                continue
            if entry.is_symlink():
                target = os.readlink(entry)
                if "/" not in target and target.endswith(".svg"):
                    mac_symlinks[entry.name] = target
                else:
                    res = entry.resolve()
                    if res.is_file():
                        mac_real[entry.stem] = res
            elif entry.is_file():
                mac_real[entry.stem] = entry

    pap_real: dict[str, Path] = {}
    pap_symlinks: dict[str, str] = {}
    if papirus_apps.is_dir():
        for entry in sorted(papirus_apps.iterdir(), key=lambda p: p.name):
            if not entry.name.endswith(".svg") or "symbolic" in entry.name:
                continue
            if entry.is_symlink():
                target = os.readlink(entry)
                if "/" not in target and target.endswith(".svg"):
                    pap_symlinks[entry.name] = target
                else:
                    res = entry.resolve()
                    if res.is_file():
                        pap_real[entry.stem] = res
            elif entry.is_file():
                pap_real[entry.stem] = entry

    for tier, ext in HICOLOR_TIERS:
        for base in extra_hicolor_dirs:
            d = base / tier / "apps"
            if not d.is_dir():
                continue
            for entry in sorted(d.iterdir(), key=lambda p: p.name):
                if entry.suffix.lower() != ext or "symbolic" in entry.stem:
                    continue
                if entry.stem not in pap_real and entry.stem not in mac_real:
                    res = entry.resolve()
                    if res.is_file():
                        pap_real[entry.stem] = res

    all_real_stems = sorted(
        set(mac_real.keys()) | set(pap_real.keys()) | set(BESPOKE_APPS.keys()) | set(DIRECT_MACTAHOE_FILES.keys())
    )
    real_set = {f"{s}.svg" for s in all_real_stems}

    # Combine symlinks whose target exists and whose link name isn't already a real or bespoke file
    combined_links: dict[str, str] = {}
    for lname, tname in {**pap_symlinks, **mac_symlinks}.items():
        stem = Path(lname).stem
        if stem in BESPOKE_APPS or stem in DIRECT_MACTAHOE_FILES or lname in real_set:
            continue
        if tname in real_set:
            combined_links[lname] = tname

    sources = [
        (
            stem,
            str(mac_real.get(stem, "")),
            str(pap_real.get(stem, "")),
        )
        for stem in all_real_stems
    ]
    return sources, sorted(combined_links.items())


def _link_path(link_path: Path, target: str) -> None:
    if link_path.is_symlink() or link_path.exists():
        link_path.unlink()
    os.symlink(target, link_path)


def build_index_theme(src_index: Path, theme_name: str, inherits: str) -> str:
    raw = src_index.read_text(encoding="utf-8", errors="replace")
    lines = raw.splitlines()
    sections: list[tuple[str, list[str]]] = []
    cur_header: str | None = None
    cur_body: list[str] = []

    for line in lines:
        if line.startswith("[") and line.endswith("]"):
            if cur_header is not None:
                sections.append((cur_header, cur_body))
            cur_header = line[1:-1]
            cur_body = []
        elif cur_header is not None:
            cur_body.append(line)
    if cur_header is not None:
        sections.append((cur_header, cur_body))

    sec_map = {h: b for h, b in sections}
    orig_dirs: list[str] = []
    for line in sec_map.get("Icon Theme", []):
        if line.startswith("Directories="):
            orig_dirs = [d for d in line.split("=", 1)[1].split(",") if d and d not in SKIP_APP_SUBDIRS]

    ordered_dirs = ["apps/scalable"] + [d for d in orig_dirs if d != "apps/scalable"]
    scaled_dirs = [d.replace("/", "@2x/", 1) for d in ordered_dirs]

    out_lines = [
        "[Icon Theme]",
        f"Name={theme_name}",
        "Comment=Square-free 3D macOS Tahoe icon theme with colorful folders",
        f"Inherits={inherits}",
        "Example=folder",
        "",
        "DesktopDefault=48",
        "DesktopSizes=16,22,32,48,64,96,128,256",
        "ToolbarDefault=22",
        "ToolbarSizes=16,22,32,48",
        "MainToolbarDefault=22",
        "MainToolbarSizes=16,22,32,48",
        "SmallDefault=16",
        "SmallSizes=16,22,32,48",
        "PanelDefault=48",
        "PanelSizes=16,22,32,48,64,96,128,256",
        "DialogDefault=32",
        "DialogSizes=16,22,32,48,64,128,256",
        "FollowsColorScheme=true",
        "",
        "KDE-Extensions=.svg",
        "",
        f"Directories={','.join(ordered_dirs)}",
        f"ScaledDirectories={','.join(scaled_dirs)}",
        "",
        "[apps/scalable]",
        "Size=64",
        "Context=Applications",
        "MinSize=16",
        "MaxSize=512",
        "Type=Scalable",
        "",
        "[apps@2x/scalable]",
        "Size=64",
        "Scale=2",
        "Context=Applications",
        "MinSize=16",
        "MaxSize=512",
        "Type=Scalable",
        "",
    ]

    for sec in ordered_dirs + scaled_dirs:
        if sec in ("apps/scalable", "apps@2x/scalable"):
            continue
        body = sec_map.get(sec)
        if not body:
            continue
        cleaned = [ln for ln in body if ln.strip() != ""]
        out_lines.append(f"[{sec}]")
        out_lines.extend(cleaned)
        out_lines.append("")

    return "\n".join(out_lines)


def populate_places_dir(theme_dest: Path, mac_dir: Path, mac_dir_name: str, has_sibling_mactahoe: bool) -> None:
    """Create places/ directory with Row-4 colorful 3D folders and self-contained or relative-linked assets."""
    places_dest = theme_dest / "places"
    scalable_dest = places_dest / "scalable"
    scalable_dest.mkdir(parents=True, exist_ok=True)
    _link_path(theme_dest / "places@2x", "places")

    mac_places = mac_dir / "places"
    if mac_places.is_dir():
        for sub in sorted(mac_places.resolve().iterdir(), key=lambda p: p.name):
            if sub.name == "scalable":
                continue
            if has_sibling_mactahoe:
                _link_path(places_dest / sub.name, f"../../{mac_dir_name}/places/{sub.name}")
            elif sub.is_dir():
                shutil.copytree(sub.resolve(), places_dest / sub.name, symlinks=True)

        mac_scalable = (mac_places / "scalable").resolve()
        if mac_scalable.is_dir():
            for entry in sorted(mac_scalable.iterdir(), key=lambda p: p.name):
                if entry.stem in COLORED_PLACES_FOLDERS or entry.stem in ("user-trash", "user-trash-full"):
                    continue
                if entry.is_symlink():
                    target = os.readlink(entry)
                    if "/" not in target:
                        _link_path(scalable_dest / entry.name, target)
                        continue
                if has_sibling_mactahoe:
                    _link_path(scalable_dest / entry.name, f"../../../{mac_dir_name}/places/scalable/{entry.name}")
                elif entry.resolve().is_file():
                    shutil.copy2(entry.resolve(), scalable_dest / entry.name)

    for stem, (ft, fb, bt, bb, glyph) in COLORED_PLACES_FOLDERS.items():
        (scalable_dest / f"{stem}.svg").write_text(
            svg_colored_folder(ft, fb, bt, bb, glyph), encoding="utf-8"
        )
    trash_svg = svg_trash_can()
    (scalable_dest / "user-trash.svg").write_text(trash_svg, encoding="utf-8")
    (scalable_dest / "user-trash-full.svg").write_text(trash_svg, encoding="utf-8")


def prepare_theme_shell(theme_dest: Path, mac_dir: Path, theme_name: str, inherits: str) -> None:
    """Create self-contained or relative-linked theme scaffolding that resolves cleanly inside Flatpak."""
    if not mac_dir.is_dir():
        raise FileNotFoundError(f"MacTahoe directory not found: {mac_dir}")

    if theme_dest.exists() or theme_dest.is_symlink():
        shutil.rmtree(theme_dest)
    apps_scalable = theme_dest / "apps" / "scalable"
    apps_scalable.mkdir(parents=True, exist_ok=True)

    mac_dir_name = mac_dir.name
    has_sibling_mactahoe = (theme_dest.parent / mac_dir_name).is_dir()

    for sub in NON_APP_LINKS:
        src = mac_dir / sub
        if not src.exists() and not src.is_symlink():
            continue
        if has_sibling_mactahoe:
            if sub in ("animations", "emotes", "preferences"):
                _link_path(theme_dest / sub, f"../MacTahoe/{sub}")
            else:
                _link_path(theme_dest / sub, f"../{mac_dir_name}/{sub}")
        else:
            real_src = src.resolve()
            if real_src.is_dir():
                shutil.copytree(real_src, theme_dest / sub, symlinks=True)
        if sub not in ("cursors", "cursors_scalable"):
            _link_path(theme_dest / f"{sub}@2x", sub)

    populate_places_dir(theme_dest, mac_dir, mac_dir_name, has_sibling_mactahoe)

    if has_sibling_mactahoe:
        _link_path(theme_dest / "apps" / "symbolic", f"../../{mac_dir_name}/apps/symbolic")
    else:
        sym_src = (mac_dir / "apps" / "symbolic").resolve()
        if sym_src.is_dir():
            shutil.copytree(sym_src, theme_dest / "apps" / "symbolic", symlinks=True)
    _link_path(theme_dest / "apps@2x", "apps")

    for doc in ("AUTHORS", "COPYING"):
        src_doc = mac_dir / doc
        if src_doc.is_file():
            shutil.copy2(src_doc, theme_dest / doc)

    index_txt = build_index_theme(mac_dir / "index.theme", theme_name, inherits)
    (theme_dest / "index.theme").write_text(index_txt, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build square-free 3D macOS icon themes.")
    parser.add_argument("--out", default="dist/icons", help="Output icons root directory")
    parser.add_argument("--dark-name", default="Papirus-MacOS-Dark", help="Dark icon theme name")
    parser.add_argument("--light-name", default="Papirus-MacOS-Light", help="Light icon theme name")
    parser.add_argument("--papirus-dir", default=DEFAULT_PAPIRUS, help="Source Papirus icon theme dir")
    parser.add_argument("--mac-dark", default=DEFAULT_MAC_DARK, help="Source MacTahoe-dark icon theme dir")
    parser.add_argument("--mac-light", default=DEFAULT_MAC_LIGHT, help="Source MacTahoe-light icon theme dir")
    parser.add_argument("--workers", type=int, default=os.cpu_count() or 4, help="Worker processes")
    args = parser.parse_args()

    out_root = Path(args.out).resolve()
    dark_dir = out_root / args.dark_name
    light_dir = out_root / args.light_name
    papirus_apps = Path(args.papirus_dir) / "64x64" / "apps"
    mac_dark = Path(args.mac_dark)
    mac_light = Path(args.mac_light)
    mac_apps = Path(DEFAULT_MAC_BASE) / "apps" / "scalable"
    extra_dirs = [Path(p) for p in DEFAULT_EXTRA_HICOLOR]

    sources, symlinks = collect_app_catalog(mac_apps, papirus_apps, extra_dirs)
    print(f"Discovered {len(sources)} app icons and {len(symlinks)} app symlinks.")

    prepare_theme_shell(
        dark_dir, mac_dark, args.dark_name, "MacTahoe-dark,Papirus-Dark,Papirus,Adwaita,breeze-dark,hicolor"
    )
    prepare_theme_shell(
        light_dir, mac_light, args.light_name, "MacTahoe-light,Papirus-Light,Papirus,Adwaita,breeze,hicolor"
    )

    dark_apps = dark_dir / "apps" / "scalable"
    light_apps = light_dir / "apps" / "scalable"

    tasks = [
        (stem, mac_src, pap_src, str(dark_apps / f"{stem}.svg"), str(light_apps / f"{stem}.svg"))
        for stem, mac_src, pap_src in sources
    ]

    failures: list[str] = []
    with ProcessPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for ok, err in pool.map(process_one_app_icon, tasks, chunksize=32):
            if not ok:
                failures.append(err)

    for link_name, target_name in symlinks:
        _link_path(dark_apps / link_name, target_name)
        _link_path(light_apps / link_name, target_name)

    if failures:
        print(f"Failed to convert {len(failures)} icon(s):", file=sys.stderr)
        for msg in failures[:15]:
            print(f"  {msg}", file=sys.stderr)
        return 1

    print(f"Built square-free {args.dark_name} and {args.light_name} in {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
