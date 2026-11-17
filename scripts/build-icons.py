#!/usr/bin/env python3
"""Build Papirus-MacOS-Dark and Papirus-MacOS-Light icon themes.

Wraps Papirus 64x64/apps SVGs (plus non-symbolic hicolor/Flatpak app icons
absent from Papirus) inside cubic-bezier macOS Tahoe squircle plates tuned
for dark and light themes, while inheriting MacTahoe UI, folders, panel,
status, cursors, and symbolic icons.
"""

from __future__ import annotations

import argparse
import base64
from concurrent.futures import ProcessPoolExecutor
import io
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
DEFAULT_MAC_DARK = "/usr/share/icons/MacTahoe-dark"
DEFAULT_MAC_LIGHT = "/usr/share/icons/MacTahoe-light"
DEFAULT_EXTRA_HICOLOR = (
    "/usr/share/icons/hicolor",
    "/var/lib/flatpak/exports/share/icons/hicolor",
    os.path.expanduser("~/.local/share/icons/hicolor"),
)

# Priority order when picking missing app icons from hicolor fallbacks.
HICOLOR_TIERS: tuple[tuple[str, str], ...] = (
    ("scalable", ".svg"),
    ("256x256", ".svg"),
    ("128x128", ".svg"),
    ("64x64", ".svg"),
    ("512x512", ".svg"),
    ("256x256", ".png"),
    ("128x128", ".png"),
    ("512x512", ".png"),
    ("64x64", ".png"),
    ("48x48", ".svg"),
    ("48x48", ".png"),
)

# Skip fixed low-res app dirs so Dock/Launcher/Grid icons always pick apps/scalable.
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
    "places",
    "preferences",
    "status",
)


def squircle_path(x: float = 4.0, y: float = 3.5, size: float = 56.0) -> str:
    """Return the exact MacTahoe cubic-bezier squircle contour in 64x64 space."""
    s = size / 14.817
    ox = x - 1.058 * s
    oy = y - 1.058 * s
    segments: list[tuple[str, list[tuple[float, float]]]] = [
        ("M", [(5.36, 1.058)]),
        ("C", [(3.83, 1.058), (2.783, 1.515), (2.10, 2.258)]),
        ("C", [(1.422, 2.998), (1.058, 4.058), (1.058, 5.258)]),
        ("L", [(1.058, 11.674)]),
        ("C", [(1.058, 12.874), (1.422, 13.935), (2.101, 14.674)]),
        ("C", [(2.783, 15.418), (3.831, 15.875), (5.361, 15.875)]),
        ("L", [(11.591, 15.875)]),
        ("C", [(13.121, 15.875), (14.169, 15.419), (14.851, 14.675)]),
        ("C", [(15.530, 13.936), (15.875, 12.973), (15.875, 11.675)]),
        ("L", [(15.875, 5.50)]),
        ("C", [(15.875, 3.930), (15.530, 2.998), (14.851, 2.258)]),
        ("C", [(14.169, 1.515), (13.121, 1.058), (11.591, 1.058)]),
        ("Z", []),
    ]
    parts: list[str] = []
    for cmd, coords in segments:
        if cmd == "Z":
            parts.append("Z")
        else:
            pts = " ".join(f"{ox + cx * s:.2f},{oy + cy * s:.2f}" for cx, cy in coords)
            parts.append(f"{cmd} {pts}")
    return " ".join(parts)


SQ_MAIN = squircle_path(4.0, 3.5, 56.0)
SQ_SHADOW1 = squircle_path(4.0, 5.0, 56.0)
SQ_SHADOW2 = squircle_path(4.3, 4.3, 55.4)
SQ_RIM = squircle_path(4.5, 4.0, 55.0)

_SVG_TAG_RE = re.compile(r"<svg([^>]*)>(.*)</svg>", re.S | re.I)
_ATTR_RE = re.compile(r'([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')
_NUM_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)")
_SKIP_INNER_ATTRS = {"xmlns", "width", "height", "viewbox", "x", "y", "id"}


def mix_rgb(
    c1: tuple[float, float, float], c2: tuple[float, float, float], t: float
) -> tuple[float, float, float]:
    """Linearly interpolate two RGB triples."""
    return tuple(c1[i] * (1.0 - t) + c2[i] * t for i in range(3))  # type: ignore[return-value]


def hex_rgb(rgb: tuple[float, float, float]) -> str:
    """Format an RGB triple as lowercase CSS hex."""
    return "#{:02x}{:02x}{:02x}".format(*(max(0, min(255, int(c))) for c in rgb))


def render_svg_image(svg_bytes: bytes, size: int = 64) -> Image.Image:
    """Rasterize SVG bytes into a square RGBA PIL image using librsvg."""
    handle = Rsvg.Handle.new_from_data(svg_bytes)
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surf)
    vp = Rsvg.Rectangle()
    vp.x = vp.y = 0
    vp.width = vp.height = size
    handle.render_document(ctx, vp)
    return Image.frombuffer("RGBA", (size, size), surf.get_data(), "raw", "BGRA", 0, 1).copy()


def analyze_image(
    im: Image.Image,
) -> tuple[tuple[int, int, int, int], tuple[int, int, int], float]:
    """Measure opaque bounding box, saturated accent color, and dark-pixel mass fraction."""
    if im.size != (64, 64):
        im = im.resize((64, 64), Image.Resampling.LANCZOS)
    px = im.load()
    min_x, min_y, max_x, max_y = 64, 64, -1, -1
    sat_r = sat_g = sat_b = sat_w = 0.0
    dark_mass = total_mass = 0

    for y in range(64):
        for x in range(64):
            r, g, b, a = px[x, y]
            if a <= 75:
                continue
            if x < min_x:
                min_x = x
            if x > max_x:
                max_x = x
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y
            total_mass += 1
            mx = max(r, g, b) / 255.0
            mn = min(r, g, b) / 255.0
            luma = (mx + mn) * 0.5
            if luma < 0.27:
                dark_mass += 1
            denom = 1.0 - abs(2.0 * luma - 1.0)
            sat = 0.0 if (mx == mn or denom <= 1e-6) else (mx - mn) / denom
            if sat > 0.22 and 0.14 < luma < 0.88:
                sat_r += r * sat
                sat_g += g * sat
                sat_b += b * sat
                sat_w += sat

    if max_x < 0:
        return (4, 4, 60, 60), (96, 138, 210), 0.0

    bbox = (min_x, min_y, max_x + 1, max_y + 1)
    if sat_w > 0.0:
        accent = (int(sat_r / sat_w), int(sat_g / sat_w), int(sat_b / sat_w))
    else:
        accent = (110, 128, 160)
    return bbox, accent, dark_mass / max(1, total_mass)


def extract_inner_svg(svg_txt: str) -> tuple[str, list[str], dict[str, str], str]:
    """Extract viewBox, extra root xmlns declarations, presentation attrs, and cleaned body."""
    m = _SVG_TAG_RE.search(svg_txt)
    if not m:
        return "0 0 64 64", [], {}, ""

    attrs_raw, body = m.group(1), m.group(2)
    extra_xmlns: list[str] = []
    inner_attrs: dict[str, str] = {}
    vb = ""
    raw_w = raw_h = "64"

    for k, v1, v2 in _ATTR_RE.findall(attrs_raw):
        val = v1 if v1 != "" else v2
        kl = k.lower()
        if kl.startswith("xmlns:"):
            if kl != "xmlns:xlink":
                extra_xmlns.append(f'{k}="{val}"')
            continue
        if kl == "viewbox":
            vb = val
        elif kl == "width":
            m_num = _NUM_RE.search(val)
            if m_num:
                raw_w = m_num.group(1)
        elif kl == "height":
            m_num = _NUM_RE.search(val)
            if m_num:
                raw_h = m_num.group(1)
        elif kl not in _SKIP_INNER_ATTRS:
            inner_attrs[k] = val

    if not vb:
        vb = f"0 0 {raw_w} {raw_h}"

    body = re.sub(r"<sodipodi:namedview[^>]*/>", "", body, flags=re.S | re.I)
    body = re.sub(r"<sodipodi:namedview[^>]*>.*?</sodipodi:namedview>", "", body, flags=re.S | re.I)
    body = re.sub(r"<metadata[^>]*>.*?</metadata>", "", body, flags=re.S | re.I)
    return vb, extra_xmlns, inner_attrs, body


def _plate_colors(
    accent: tuple[int, int, int], dark_frac: float, dark: bool
) -> tuple[str, str, str, str, str, str]:
    """Compute top/bottom plate gradient, glow, border, and rim opacities for Light or Dark."""
    if not dark:
        top_col = mix_rgb((255.0, 255.0, 255.0), accent, 0.06)
        bot_col = mix_rgb((232.0, 236.0, 245.0), accent, 0.13)
        return hex_rgb(top_col), hex_rgb(bot_col), "rgba(0,0,0,0.09)", "0.90", "0.22", "0.25"

    if dark_frac > 0.45:
        top_col = mix_rgb((74.0, 79.0, 92.0), accent, 0.10)
        bot_col = mix_rgb((42.0, 46.0, 56.0), accent, 0.08)
        glow_alpha = "0.14"
    else:
        top_col = mix_rgb((42.0, 45.0, 54.0), accent, 0.19)
        bot_col = mix_rgb((21.0, 23.0, 29.0), accent, 0.14)
        glow_alpha = "0.11"
    return hex_rgb(top_col), hex_rgb(bot_col), "rgba(255,255,255,0.14)", "0.44", "0.14", glow_alpha


def build_squircle_svg(
    inner_markup: str,
    bbox: tuple[int, int, int, int],
    accent: tuple[int, int, int],
    dark_frac: float,
    dark: bool,
    extra_xmlns: Iterable[str] = (),
    id_prefix: str = "pm",
) -> str:
    """Wrap arbitrary 64x64 inner SVG markup inside a macOS squircle plate."""
    bx0, by0, bx1, by1 = bbox
    bw, bh = max(1, bx1 - bx0), max(1, by1 - by0)
    cx, cy = (bx0 + bx1) * 0.5, (by0 + by1) * 0.5
    scale = max(0.56, min(0.80, min(40.0 / bw, 40.0 / bh)))
    top_hex, bot_hex, border_col, rim_top, rim_bot, glow = _plate_colors(accent, dark_frac, dark)

    xmlns_str = ' '.join(
        ['xmlns="http://www.w3.org/2000/svg"', 'xmlns:xlink="http://www.w3.org/1999/xlink"', *extra_xmlns]
    )
    return (
        f"<svg {xmlns_str} width=\"64\" height=\"64\" viewBox=\"0 0 64 64\">\n"
        f"  <defs>\n"
        f"    <linearGradient id=\"{id_prefix}_plate\" x1=\"32\" y1=\"3.5\" x2=\"32\" y2=\"59.5\" gradientUnits=\"userSpaceOnUse\">\n"
        f"      <stop offset=\"0\" stop-color=\"{top_hex}\"/>\n"
        f"      <stop offset=\"1\" stop-color=\"{bot_hex}\"/>\n"
        f"    </linearGradient>\n"
        f"    <radialGradient id=\"{id_prefix}_glow\" cx=\"32\" cy=\"28\" r=\"28\" gradientUnits=\"userSpaceOnUse\">\n"
        f"      <stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"{glow}\"/>\n"
        f"      <stop offset=\"1\" stop-color=\"#ffffff\" stop-opacity=\"0\"/>\n"
        f"    </radialGradient>\n"
        f"    <linearGradient id=\"{id_prefix}_rim\" x1=\"8\" y1=\"4\" x2=\"54\" y2=\"56\" gradientUnits=\"userSpaceOnUse\">\n"
        f"      <stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"{rim_top}\"/>\n"
        f"      <stop offset=\"0.42\" stop-color=\"#ffffff\" stop-opacity=\"0.02\"/>\n"
        f"      <stop offset=\"0.72\" stop-color=\"#ffffff\" stop-opacity=\"0\"/>\n"
        f"      <stop offset=\"1\" stop-color=\"#ffffff\" stop-opacity=\"{rim_bot}\"/>\n"
        f"    </linearGradient>\n"
        f"    <clipPath id=\"{id_prefix}_clip\">\n"
        f"      <path d=\"{SQ_MAIN}\"/>\n"
        f"    </clipPath>\n"
        f"  </defs>\n"
        f"  <path d=\"{SQ_SHADOW1}\" fill=\"#000000\" opacity=\"0.14\"/>\n"
        f"  <path d=\"{SQ_SHADOW2}\" fill=\"#000000\" opacity=\"0.18\"/>\n"
        f"  <path d=\"{SQ_MAIN}\" fill=\"url(#{id_prefix}_plate)\"/>\n"
        f"  <path d=\"{SQ_MAIN}\" fill=\"url(#{id_prefix}_glow)\"/>\n"
        f"  <g clip-path=\"url(#{id_prefix}_clip)\">\n"
        f"    <g transform=\"translate(32, 31.5) scale({scale:.4f}) translate({-cx:.2f}, {-cy:.2f})\">\n"
        f"      {inner_markup}\n"
        f"    </g>\n"
        f"  </g>\n"
        f"  <path d=\"{SQ_MAIN}\" fill=\"none\" stroke=\"{border_col}\" stroke-width=\"0.9\"/>\n"
        f"  <path d=\"{SQ_RIM}\" fill=\"none\" stroke=\"url(#{id_prefix}_rim)\" stroke-width=\"1.15\"/>\n"
        f"</svg>\n"
    )


def process_one_icon(task: tuple[str, str, str, str]) -> tuple[bool, str]:
    """Generate Dark and Light squircle SVGs for one source SVG or PNG file."""
    src_path, dark_out, light_out, kind = task
    try:
        if kind == "svg":
            svg_txt = Path(src_path).read_text(encoding="utf-8", errors="replace")
            im = render_svg_image(svg_txt.encode("utf-8"), 64)
            bbox, accent, dark_frac = analyze_image(im)
            vb, extra_xmlns, inner_attrs, body = extract_inner_svg(svg_txt)
            attr_str = "".join(f' {k}="{v}"' for k, v in inner_attrs.items())
            inner_markup = f'<svg x="0" y="0" width="64" height="64" viewBox="{vb}"{attr_str}>{body}</svg>'
        else:
            with Image.open(src_path) as raw:
                im = raw.convert("RGBA")
                bbox, accent, dark_frac = analyze_image(im)
                if max(im.size) > 128:
                    im = im.resize((128, 128), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                im.save(buf, format="PNG", optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            extra_xmlns = ()
            inner_markup = (
                f'<image x="0" y="0" width="64" height="64" '
                f'preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{b64}"/>'
            )

        id_prefix = "fg_pm" if "pm_plate" in inner_markup else "pm"
        Path(dark_out).write_text(
            build_squircle_svg(inner_markup, bbox, accent, dark_frac, True, extra_xmlns, id_prefix),
            encoding="utf-8",
        )
        Path(light_out).write_text(
            build_squircle_svg(inner_markup, bbox, accent, dark_frac, False, extra_xmlns, id_prefix),
            encoding="utf-8",
        )
        return True, ""
    except Exception as exc:  # pragma: no cover - surfaced in build summary
        return False, f"{src_path}: {exc}"


def collect_sources(
    papirus_apps: Path, extra_hicolor_dirs: Iterable[Path]
) -> tuple[list[tuple[str, Path, str]], list[tuple[str, str]]]:
    """Collect real source icons (SVG/PNG) and relative in-dir symlinks."""
    real_sources: dict[str, tuple[Path, str]] = {}
    symlinks: list[tuple[str, str]] = []

    if not papirus_apps.is_dir():
        raise FileNotFoundError(f"Papirus apps directory not found: {papirus_apps}")

    entries = sorted(papirus_apps.iterdir(), key=lambda p: p.name)
    app_entry_names = {p.name for p in entries}

    for entry in entries:
        if "symbolic" in entry.name or not entry.name.endswith(".svg"):
            continue
        if entry.is_symlink():
            target = os.readlink(entry)
            if "/" not in target and target in app_entry_names and "symbolic" not in target:
                symlinks.append((entry.name, target))
            else:
                resolved = entry.resolve()
                if resolved.is_file() and resolved.suffix.lower() == ".svg":
                    real_sources[entry.stem] = (resolved, "svg")
        elif entry.is_file():
            real_sources[entry.stem] = (entry, "svg")

    # Add non-symbolic SVG/PNG app icons missing from Papirus (Flatpak & hicolor).
    known_stems = set(real_sources.keys()) | {Path(name).stem for name, _ in symlinks}
    for tier, ext in HICOLOR_TIERS:
        for base in extra_hicolor_dirs:
            apps_dir = base / tier / "apps"
            if not apps_dir.is_dir():
                continue
            for entry in sorted(apps_dir.iterdir(), key=lambda p: p.name):
                if entry.suffix.lower() != ext or "symbolic" in entry.stem:
                    continue
                if entry.stem in known_stems or entry.stem in real_sources:
                    continue
                resolved = entry.resolve()
                if resolved.is_file():
                    real_sources[entry.stem] = (resolved, ext.lstrip("."))
                    known_stems.add(entry.stem)

    ordered = [(f"{stem}.svg", src, kind) for stem, (src, kind) in sorted(real_sources.items())]
    return ordered, symlinks


def _link_target(src: Path, theme_dest: Path, use_relative: bool) -> str:
    """Resolve chained internal MacTahoe symlinks into a stable direct target."""
    resolved = src.resolve() if src.is_symlink() else src
    if use_relative:
        return os.path.relpath(resolved, theme_dest)
    return str(resolved)


def _link_path(link_path: Path, target: str) -> None:
    """Create a symlink cleanly without failing on existing paths."""
    if link_path.is_symlink() or link_path.exists():
        link_path.unlink()
    os.symlink(target, link_path)


def build_index_theme(src_index: Path, theme_name: str, inherits: str) -> str:
    """Derive a clean index.theme prioritizing apps/scalable over fixed app sizes."""
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
        "Comment=Papirus app icons in frosted macOS squircles with MacTahoe UI & folders",
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


def prepare_theme_shell(theme_dest: Path, mac_dir: Path, theme_name: str, inherits: str) -> None:
    """Create theme directory scaffolding, non-app MacTahoe symlinks, and index.theme."""
    if not mac_dir.is_dir():
        raise FileNotFoundError(f"MacTahoe directory not found: {mac_dir}")

    if theme_dest.exists() or theme_dest.is_symlink():
        shutil.rmtree(theme_dest)
    apps_scalable = theme_dest / "apps" / "scalable"
    apps_scalable.mkdir(parents=True, exist_ok=True)

    use_relative = theme_dest.parent.resolve() == mac_dir.parent.resolve()

    for sub in NON_APP_LINKS:
        src = mac_dir / sub
        if not src.exists():
            continue
        _link_path(theme_dest / sub, _link_target(src, theme_dest, use_relative))
        at2x = mac_dir / f"{sub}@2x"
        if at2x.exists() or at2x.is_symlink():
            _link_path(theme_dest / f"{sub}@2x", sub)

    sym_src = mac_dir / "apps" / "symbolic"
    if sym_src.exists():
        _link_path(theme_dest / "apps" / "symbolic", _link_target(sym_src, theme_dest / "apps", use_relative))
    _link_path(theme_dest / "apps@2x", "apps")

    for doc in ("AUTHORS", "COPYING"):
        src_doc = mac_dir / doc
        if src_doc.is_file():
            shutil.copy2(src_doc, theme_dest / doc)

    index_txt = build_index_theme(mac_dir / "index.theme", theme_name, inherits)
    (theme_dest / "index.theme").write_text(index_txt, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Papirus x macOS icon themes.")
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
    extra_dirs = [Path(p) for p in DEFAULT_EXTRA_HICOLOR]

    sources, symlinks = collect_sources(papirus_apps, extra_dirs)
    print(f"Discovered {len(sources)} source icons and {len(symlinks)} app symlinks.")

    prepare_theme_shell(
        dark_dir, mac_dark, args.dark_name, "MacTahoe-dark,Papirus-Dark,Papirus,breeze-dark,hicolor"
    )
    prepare_theme_shell(
        light_dir, mac_light, args.light_name, "MacTahoe-light,Papirus-Light,Papirus,breeze,hicolor"
    )

    dark_apps = dark_dir / "apps" / "scalable"
    light_apps = light_dir / "apps" / "scalable"

    tasks = [
        (str(src), str(dark_apps / filename), str(light_apps / filename), kind)
        for filename, src, kind in sources
    ]

    failures: list[str] = []
    with ProcessPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for ok, err in pool.map(process_one_icon, tasks, chunksize=32):
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

    print(f"Built {args.dark_name} and {args.light_name} in {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
