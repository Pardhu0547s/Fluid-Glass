#!/usr/bin/env python3
"""
Fluid Glass Settings - Native GTK4 & Libadwaita Customization App
Configures the unified Fluid Glass Suite (Tahoe Control Center, Top Bar, Dock, GLSL Shaders)
"""

import sys
import os
import subprocess
import gi

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('Gio', '2.0')
gi.require_version('GLib', '2.0')

from gi.repository import Gtk, Adw, Gio, GLib, Gdk

APP_ID = "org.gnome.FluidGlass.Settings"
EXTENSION_UUID = "fluid-glass@fedora"

SCHEMA_MASTER = "org.gnome.shell.extensions.fluid-glass"
SCHEMA_LINTEL = "org.gnome.shell.extensions.lintel"
SCHEMA_GLASS = "org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com"
SCHEMA_DOCK = "org.gnome.shell.extensions.dash2dock-lite"


def safe_get_settings(schema_id):
    try:
        source = Gio.SettingsSchemaSource.get_default()
        if source and source.lookup(schema_id, True):
            return Gio.Settings.new(schema_id)
    except Exception as e:
        print(f"Schema {schema_id} not found: {e}")
    return None


def run_cmd(cmd):
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return res.stdout.strip()
    except Exception:
        return ""


class FluidGlassWindow(Adw.PreferencesWindow):
    def __init__(self, app):
        super().__init__(application=app, title="Fluid Glass Settings")
        self.set_default_size(780, 680)
        self.set_icon_name("fluid-glass")

        self.s_master = safe_get_settings(SCHEMA_MASTER)
        self.s_lintel = safe_get_settings(SCHEMA_LINTEL)
        self.s_glass = safe_get_settings(SCHEMA_GLASS)
        self.s_dock = safe_get_settings(SCHEMA_DOCK)

        self._build_presets_page()
        self._build_glass_page()
        self._build_control_center_page()
        self._build_dock_page()
        self._build_topbar_page()
        self._build_about_page()

    def _build_presets_page(self):
        page = Adw.PreferencesPage(title="Overview & Presets", icon_name="preferences-desktop-theme-symbolic")
        self.add(page)

        # Suite Master Switch
        group_master = Adw.PreferencesGroup(title="Fluid Glass Suite", description="Master controller for all visual glass components")
        page.add(group_master)

        row_master = Adw.ActionRow(title="Master Suite Status", subtitle=f"Extension: {EXTENSION_UUID}")
        self.switch_master = Gtk.Switch(valign=Gtk.Align.CENTER)
        is_enabled = EXTENSION_UUID in run_cmd("gnome-extensions list --enabled")
        self.switch_master.set_active(is_enabled)
        self.switch_master.connect("state-set", self._on_master_toggled)
        row_master.add_suffix(self.switch_master)
        group_master.add(row_master)

        # Presets
        group_presets = Adw.PreferencesGroup(title="Theme Presets", description="Instant one-click fluid glass appearance styles")
        page.add(group_presets)

        presets = [
            ("Tahoe Crystal (Recommended)", "Authentic macOS Tahoe fluid glass with 22% white luminance, specular rims &amp; electric blue active states", "tahoe-crystal"),
            ("Deep Frosted Glass", "Heavier translucent matte blur with rich diffusion for bright busy wallpapers", "deep-frosted"),
            ("Midnight Obsidian", "Dark stealth tinted glass with luminous edges and vibrant blue accents", "midnight-glass"),
            ("Electric Neon", "High-contrast specular highlights with energetic vibrant blue refraction", "electric-neon")
        ]

        for title, desc, preset_id in presets:
            row = Adw.ActionRow(title=title, subtitle=desc)
            btn = Gtk.Button(label="Apply", valign=Gtk.Align.CENTER)
            btn.connect("clicked", lambda b, pid=preset_id: self._apply_preset(pid))
            row.add_suffix(btn)
            group_presets.add(row)

        # Core Subsystems Toggles
        if self.s_master:
            group_sub = Adw.PreferencesGroup(title="Active Components", description="Select which subsystems are managed by Fluid Glass")
            page.add(group_sub)

            row_topbar = Adw.SwitchRow(title="Top Bar (macOS Layout)", subtitle="Apple menu, active app title, status icons, clock")
            self.s_master.bind("enable-topbar", row_topbar, "active", Gio.SettingsBindFlags.DEFAULT)
            group_sub.add(row_topbar)

            row_cc = Adw.SwitchRow(title="Tahoe Control Center", subtitle="6-row floating glass modules sitting directly over wallpaper")
            self.s_master.bind("enable-control-center", row_cc, "active", Gio.SettingsBindFlags.DEFAULT)
            group_sub.add(row_cc)

            row_dock = Adw.SwitchRow(title="Fluid Animated Dock", subtitle="Magnification dock with real GLSL liquid glass refraction")
            self.s_master.bind("enable-dock", row_dock, "active", Gio.SettingsBindFlags.DEFAULT)
            group_sub.add(row_dock)

            row_glass = Adw.SwitchRow(title="GLSL Liquid Glass Shaders", subtitle="Real-time GPU refraction, reflection, and specular highlight shaders")
            self.s_master.bind("enable-glass-shaders", row_glass, "active", Gio.SettingsBindFlags.DEFAULT)
            group_sub.add(row_glass)

        # Maintenance Actions
        group_actions = Adw.PreferencesGroup(title="Maintenance")
        page.add(group_actions)

        row_reload = Adw.ActionRow(title="Reload Extension", subtitle="Restart the Fluid Glass extension to apply low-level compositor changes")
        btn_reload = Gtk.Button(label="Reload Now", valign=Gtk.Align.CENTER)
        btn_reload.connect("clicked", lambda b: self._reload_extension())
        row_reload.add_suffix(btn_reload)
        group_actions.add(row_reload)

    def _build_glass_page(self):
        page = Adw.PreferencesPage(title="Glass & Shaders", icon_name="applications-graphics-symbolic")
        self.add(page)

        # Shader Engine
        group_gl = Adw.PreferencesGroup(title="GPU Refraction &amp; Blur", description="GLSL fluid glass shader parameters")
        page.add(group_gl)

        if self.s_glass:
            # Blur Radius
            row_blur = Adw.ActionRow(title="Liquid Blur Radius", subtitle="Kawase multi-pass blur spread in pixels")
            scale_blur = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 4, 48, 2)
            scale_blur.set_hexpand(True)
            scale_blur.set_valign(Gtk.Align.CENTER)
            scale_blur.set_value(self.s_glass.get_int("dock-blur-radius") if "dock-blur-radius" in self.s_glass.list_keys() else 16)
            scale_blur.connect("value-changed", lambda s: self.s_glass.set_int("dock-blur-radius", int(s.get_value())))
            row_blur.add_suffix(scale_blur)
            group_gl.add(row_blur)

            # Tint Strength
            row_tint = Adw.ActionRow(title="Glass Tint Strength", subtitle="Whiteness and luminance intensity")
            scale_tint = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.05, 0.80, 0.05)
            scale_tint.set_hexpand(True)
            scale_tint.set_valign(Gtk.Align.CENTER)
            scale_tint.set_value(self.s_glass.get_double("dock-tint-strength") if "dock-tint-strength" in self.s_glass.list_keys() else 0.15)
            scale_tint.connect("value-changed", lambda s: self.s_glass.set_double("dock-tint-strength", s.get_value()))
            row_tint.add_suffix(scale_tint)
            group_gl.add(row_tint)

            # Dock Glass
            row_dock_gl = Adw.SwitchRow(title="Dock Liquid Glass", subtitle="Render real GLSL refraction behind the dock")
            self.s_glass.bind("enable-dock-glass", row_dock_gl, "active", Gio.SettingsBindFlags.DEFAULT)
            group_gl.add(row_dock_gl)

            # Topbar Glass
            if "enable-topbar-glass" in self.s_glass.list_keys():
                row_bar_gl = Adw.SwitchRow(title="Top Bar Liquid Glass", subtitle="Render refraction behind top bar")
                self.s_glass.bind("enable-topbar-glass", row_bar_gl, "active", Gio.SettingsBindFlags.DEFAULT)
                group_gl.add(row_bar_gl)

        # Floating Cards Contrast
        group_rim = Adw.PreferencesGroup(title="Specular Rim &amp; Depth", description="Physical glass edges and top highlight reflections")
        page.add(group_rim)

        row_rim = Adw.ActionRow(title="Specular Highlight Reflection", subtitle="Luminous white top border glow (inset 1px reflection)")
        switch_rim = Gtk.Switch(valign=Gtk.Align.CENTER, active=True)
        row_rim.add_suffix(switch_rim)
        group_rim.add(row_rim)

    def _build_control_center_page(self):
        page = Adw.PreferencesPage(title="Control Center", icon_name="preferences-system-symbolic")
        self.add(page)

        group_cc = Adw.PreferencesGroup(title="macOS Tahoe Layout", description="Floating glass modules floating directly over wallpaper")
        page.add(group_cc)

        if self.s_lintel:
            row_mode = Adw.ComboRow(title="Control Center Mode", subtitle="macOS Tahoe custom floating modules vs standard GNOME")
            model = Gtk.StringList.new(["Custom Tahoe (Recommended)", "Native GNOME"])
            row_mode.set_model(model)
            current_mode = self.s_lintel.get_string("control-center-mode")
            row_mode.set_selected(0 if current_mode == "custom" else 1)
            row_mode.connect("notify::selected", lambda r, p: self.s_lintel.set_string("control-center-mode", "custom" if r.get_selected() == 0 else "native"))
            group_cc.add(row_mode)

        # Accent Color
        group_accent = Adw.PreferencesGroup(title="Active Accent Color", description="Color when toggle capsules (Wi-Fi, Bluetooth) are enabled")
        page.add(group_accent)

        row_acc = Adw.ActionRow(title="Accent Preset", subtitle="Selected color applied to active toggles and highlights")
        group_accent.add(row_acc)

        box_colors = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8, valign=Gtk.Align.CENTER)
        colors = [
            ("Electric Blue", "#007aff"),
            ("Tahoe Purple", "#af52de"),
            ("Emerald Green", "#34c759"),
            ("Sunset Orange", "#ff9500"),
            ("Crimson Red", "#ff3b30"),
            ("Obsidian Gray", "#545458")
        ]

        for name, hex_code in colors:
            btn = Gtk.Button(label=name)
            btn.connect("clicked", lambda b, hc=hex_code: self._set_accent_color(hc))
            box_colors.append(btn)
        row_acc.add_suffix(box_colors)

        # Tahoe Layout Modules
        group_modules = Adw.PreferencesGroup(title="Control Center Modules", description="6-row Tahoe layout structure")
        page.add(group_modules)

        modules_info = [
            ("Row 1: Wi-Fi Capsule (Wide)", "Left half wide module with network indicator", True),
            ("Row 1 &amp; 2: Now Playing Media (Large 2x2)", "Right half square tile with artwork, title &amp; playback controls", True),
            ("Row 2: Bluetooth Disc (Small Circle)", "Compact 1x1 circular toggle with specular rim", True),
            ("Row 2: AirDrop Disc (Small Circle)", "Compact 1x1 circular quick share toggle", True),
            ("Row 3: Focus Mode Capsule (Wide)", "Left half wide module with Do Not Disturb", True),
            ("Row 3: Stage Manager &amp; Screen Mirroring", "Right half two compact circular action discs", True),
            ("Row 4: Display Brightness Slider", "Full-width slider with capsule knob and luminous track", True),
            ("Row 5: Sound Volume Slider", "Full-width slider with capsule knob and luminous track", True),
            ("Row 6: 4 Action Discs", "Dark Mode, Night Light, Screenshot, Airplane Mode", True),
            ("Bottom: Edit Controls", "Translucent pill button to customize modules", True)
        ]

        for title, desc, active in modules_info:
            row = Adw.ActionRow(title=title, subtitle=desc)
            sw = Gtk.Switch(valign=Gtk.Align.CENTER, active=active)
            row.add_suffix(sw)
            group_modules.add(row)

    def _build_dock_page(self):
        page = Adw.PreferencesPage(title="Fluid Dock", icon_name="user-desktop-symbolic")
        self.add(page)

        group_dock = Adw.PreferencesGroup(title="Dock Behavior &amp; Geometry", description="macOS style magnification dock")
        page.add(group_dock)

        if self.s_dock:
            # Magnification
            row_mag = Adw.ActionRow(title="Hover Magnification", subtitle="Smooth zoom effect on mouse hover")
            scale_mag = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.0, 0.60, 0.05)
            scale_mag.set_hexpand(True)
            scale_mag.set_valign(Gtk.Align.CENTER)
            scale_mag.set_value(self.s_dock.get_double("animation-magnify"))
            scale_mag.connect("value-changed", lambda s: self.s_dock.set_double("animation-magnify", s.get_value()))
            row_mag.add_suffix(scale_mag)
            group_dock.add(row_mag)

            # Autohide
            row_hide = Adw.SwitchRow(title="Autohide Dock", subtitle="Automatically slide dock away when windows overlap")
            self.s_dock.bind("autohide-dash", row_hide, "active", Gio.SettingsBindFlags.DEFAULT)
            group_dock.add(row_hide)

            # Dodge windows
            row_dodge = Adw.SwitchRow(title="Intelligent Window Dodge", subtitle="Only autohide when an active window overlaps the dock area")
            self.s_dock.bind("autohide-dodge", row_dodge, "active", Gio.SettingsBindFlags.DEFAULT)
            group_dock.add(row_dodge)

            # Transparent dock background
            row_trans = Adw.ActionRow(title="Transparent Dock Base", subtitle="Zero dock opacity so GLSL Liquid Glass renders cleanly")
            sw_trans = Gtk.Switch(valign=Gtk.Align.CENTER, active=True)
            sw_trans.connect("state-set", lambda sw, st: self._set_dock_transparent(st))
            row_trans.add_suffix(sw_trans)
            group_dock.add(row_trans)

    def _build_topbar_page(self):
        page = Adw.PreferencesPage(title="Top Bar", icon_name="open-menu-symbolic")
        self.add(page)

        group_bar = Adw.PreferencesGroup(title="Menu Bar Structure", description="macOS style top panel")
        page.add(group_bar)

        if self.s_lintel:
            row_sys = Adw.SwitchRow(title="Apple / System Menu", subtitle="Show the left-hand Apple logo menu")
            self.s_lintel.bind("show-system-menu", row_sys, "active", Gio.SettingsBindFlags.DEFAULT)
            group_bar.add(row_sys)

            row_app = Adw.SwitchRow(title="Active Application Name", subtitle="Show focused app title next to Apple menu")
            self.s_lintel.bind("show-active-app", row_app, "active", Gio.SettingsBindFlags.DEFAULT)
            group_bar.add(row_app)

            row_clock_r = Adw.SwitchRow(title="Clock on Far Right", subtitle="macOS style date &amp; clock position")
            self.s_lintel.bind("clock-on-right", row_clock_r, "active", Gio.SettingsBindFlags.DEFAULT)
            group_bar.add(row_clock_r)

            row_nc = Adw.SwitchRow(title="Tahoe Notification Center", subtitle="Open macOS widgets panel when clicking the clock")
            self.s_lintel.bind("notification-center-enabled", row_nc, "active", Gio.SettingsBindFlags.DEFAULT)
            group_bar.add(row_nc)

    def _build_about_page(self):
        page = Adw.PreferencesPage(title="About", icon_name="help-about-symbolic")
        self.add(page)

        group_about = Adw.PreferencesGroup()
        page.add(group_about)

        # Status row
        status_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin_top=24, margin_bottom=24)
        
        icon = Gtk.Image.new_from_icon_name("fluid-glass")
        icon.set_pixel_size(96)
        status_box.append(icon)

        title = Gtk.Label(label="Fluid Glass Suite", css_classes=["title-1"])
        subtitle = Gtk.Label(label="Unified macOS Tahoe Fluid Glass Experience for GNOME", css_classes=["subtitle"])
        version = Gtk.Label(label="Version 1.0.0", css_classes=["caption"])
        status_box.append(title)
        status_box.append(subtitle)
        status_box.append(version)

        group_about.add(status_box)

        group_info = Adw.PreferencesGroup(title="System Environment")
        page.add(group_info)

        shell_ver = run_cmd("gnome-shell --version")
        group_info.add(Adw.ActionRow(title="Compositor", subtitle=shell_ver or "GNOME Shell 51"))
        group_info.add(Adw.ActionRow(title="Windowing", subtitle=os.environ.get("XDG_SESSION_TYPE", "wayland").capitalize()))
        group_info.add(Adw.ActionRow(title="Extension UUID", subtitle=EXTENSION_UUID))

    def _on_master_toggled(self, switch, state):
        cmd = f"gnome-extensions {'enable' if state else 'disable'} {EXTENSION_UUID}"
        run_cmd(cmd)
        return False

    def _apply_preset(self, preset_id):
        if preset_id == "tahoe-crystal":
            if self.s_glass:
                self.s_glass.set_int("dock-blur-radius", 16)
                self.s_glass.set_double("dock-tint-strength", 0.15)
                self.s_glass.set_double("dock-brightness", 1.05)
                self.s_glass.set_strv("disabled-extra-menus", ["lintel-control-center"])
            if self.s_lintel:
                self.s_lintel.set_string("control-center-mode", "custom")
            if self.s_dock:
                self.s_dock.set_value("background-color", GLib.Variant("(dddd)", (0.0, 0.0, 0.0, 0.0)))
            self._set_accent_color("#007aff")

        elif preset_id == "deep-frosted":
            if self.s_glass:
                self.s_glass.set_int("dock-blur-radius", 28)
                self.s_glass.set_double("dock-tint-strength", 0.35)
                self.s_glass.set_double("dock-brightness", 1.10)
            self._set_accent_color("#007aff")

        elif preset_id == "midnight-glass":
            if self.s_glass:
                self.s_glass.set_int("dock-blur-radius", 20)
                self.s_glass.set_double("dock-tint-strength", 0.08)
                self.s_glass.set_double("dock-brightness", 0.85)
            self._set_accent_color("#007aff")

        elif preset_id == "electric-neon":
            if self.s_glass:
                self.s_glass.set_int("dock-blur-radius", 14)
                self.s_glass.set_double("dock-tint-strength", 0.25)
                self.s_glass.set_double("dock-brightness", 1.20)
            self._set_accent_color("#00c6ff")

        if self.s_master:
            self.s_master.set_string("glass-preset", preset_id)

    def _set_accent_color(self, hex_code):
        if self.s_master:
            self.s_master.set_string("accent-color", hex_code)

    def _set_dock_transparent(self, transparent):
        if self.s_dock:
            alpha = 0.0 if transparent else 0.25
            self.s_dock.set_value("background-color", GLib.Variant("(dddd)", (0.0, 0.0, 0.0, alpha)))
        return False

    def _reload_extension(self):
        cmd = f"gnome-extensions disable {EXTENSION_UUID} && sleep 1 && gnome-extensions enable {EXTENSION_UUID}"
        run_cmd(cmd)


class FluidGlassApp(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.FLAGS_NONE)

    def do_activate(self):
        win = self.props.active_window
        if not win:
            win = FluidGlassWindow(self)
        win.present()


def main():
    app = FluidGlassApp()
    return app.run(sys.argv)


if __name__ == "__main__":
    sys.exit(main())
