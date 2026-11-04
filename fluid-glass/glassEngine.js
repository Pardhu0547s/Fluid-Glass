import GLib from 'gi://GLib';

import {UIManager} from './glass/uiManager.js';
import {PanelMenuManager, ExtraDateMenuManager} from './glass/panelMenuManager.js';
import {BlurMyShellWatch} from './glass/blurMyShell.js';
import {DockWatcher} from './glass/dockManager.js';
import {NotificationManager} from './glass/notificationManager.js';
import {QuickSettingsManager} from './glass/quickSettingsManager.js';
import {OsdManager} from './glass/osdManager.js';
import {ApplicationManager} from './glass/applicationManager.js';
import {WindowListService} from './glass/windowListService.js';
import {TopBarManager, ExtraTopBarManager} from './glass/topBarManager.js';
import {DesktopLayer} from './glass/desktop/desktopLayer.js';
import {Launcher} from './glass/launcherManager.js';
import {IconStyler} from './glass/iconStyle/iconStyler.js';
import {Logger, setUtilsLogger} from './glass/logger.js';
import {adaptiveColorTweener} from './glass/animation.js';
import {installGlassDiagnostics, removeGlassDiagnostics, DumpShortcut} from './glass/diagnostics.js';
import {trackViewPaints, untrackViewPaints} from './glass/rendering/backdropGlass.js';
import {clearShaderSources} from './glass/rendering/pipelines.js';

const QUICK_SETTINGS_DELAY_MS = 1500;

export class GlassEngine {
  constructor(extensionPath, settings, openPreferencesFn) {
    this._path = extensionPath;
    this._settings = settings;
    this._openPreferences = openPreferencesFn || (() => {});
    this._logger = new Logger(this._settings);
  }

  enable() {
    setUtilsLogger(this._logger);
    installGlassDiagnostics();
    trackViewPaints();

    const path = this._path;
    const settings = this._settings;
    const logger = this._logger;

    this._uiManager = new UIManager(path, settings, logger);
    this._uiManager.setup();

    this._extraDateMenuManager = new ExtraDateMenuManager(path, settings, logger);
    this._extraDateMenuManager.setup();

    this._panelMenuManager = new PanelMenuManager(path, settings, logger);
    this._panelMenuManager.setup();

    this._topBarManager = new TopBarManager(path, settings, logger);
    this._topBarManager.setup();

    this._extraTopBarManager = new ExtraTopBarManager(path, settings, logger);
    this._extraTopBarManager.setup();

    this._desktopLayer = new DesktopLayer(path, settings, logger, this._openPreferences);
    this._desktopLayer.setup();

    this._iconStyler = new IconStyler(path, settings, logger);
    this._iconStyler.setup();

    this._launcher = new Launcher(path, settings, logger, this._iconStyler);
    this._launcher.setup();

    this._blurMyShellWatch = new BlurMyShellWatch(settings, logger);
    this._blurMyShellWatch.setup();

    this._notificationManager = new NotificationManager(path, settings, logger);
    this._notificationManager.setup();

    this._osdManager = new OsdManager(path, settings, logger);
    this._osdManager.setup();

    this._applicationManager = new ApplicationManager(path, settings, logger);
    this._applicationManager.setup();

    this._windowListService = new WindowListService(logger);
    this._windowListService.setup();

    this._quickSettingsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, QUICK_SETTINGS_DELAY_MS, () => {
      this._quickSettingsTimeoutId = 0;
      this._quickSettingsManager = new QuickSettingsManager(path, settings, logger);
      this._quickSettingsManager.setup();
      return GLib.SOURCE_REMOVE;
    });

    this._dockWatcher = new DockWatcher(path, settings, logger, this._iconStyler);
    this._dockWatcher.setup();

    this._dumpShortcut = new DumpShortcut(settings);
    this._dumpShortcut.setup();
  }

  disable() {
    this._dumpShortcut?.cleanup();
    this._dumpShortcut = null;

    adaptiveColorTweener.stopAll();

    if (this._quickSettingsTimeoutId) {
      GLib.Source.remove(this._quickSettingsTimeoutId);
      this._quickSettingsTimeoutId = 0;
    }

    this._panelMenuManager?.cleanup();
    this._panelMenuManager = null;

    this._topBarManager?.cleanup();
    this._topBarManager = null;

    this._extraTopBarManager?.cleanup();
    this._extraTopBarManager = null;

    this._desktopLayer?.cleanup();
    this._desktopLayer = null;

    this._launcher?.cleanup();
    this._launcher = null;

    this._blurMyShellWatch?.cleanup();
    this._blurMyShellWatch = null;

    this._uiManager?.cleanup();
    this._uiManager = null;

    this._extraDateMenuManager?.cleanup();
    this._extraDateMenuManager = null;

    this._quickSettingsManager?.cleanup();
    this._quickSettingsManager = null;

    this._dockWatcher?.cleanup();
    this._dockWatcher = null;

    this._iconStyler?.cleanup();
    this._iconStyler = null;

    this._notificationManager?.cleanup();
    this._notificationManager = null;

    this._osdManager?.cleanup();
    this._osdManager = null;

    this._applicationManager?.cleanup();
    this._applicationManager = null;

    this._windowListService?.cleanup();
    this._windowListService = null;

    untrackViewPaints();
    clearShaderSources();
    removeGlassDiagnostics();
  }
}
