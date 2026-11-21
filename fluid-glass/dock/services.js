'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { tempPath, trySpawnCommandLine } from './utils.js';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';

import { Clock } from './apps/clock.js';
import { Calendar } from './apps/calendar.js';

const CANVAS_SIZE = 120;
const DEBOUNCE_CHECK_TIMEOUT = 750;

class ServiceCounter {
  constructor(name, interval, callback, advance) {
    advance = advance || 0;
    this.name = name;
    this._interval = interval;
    this._ticks = advance == -1 ? interval : advance;
    this._callback = callback;
  }

  update(elapsed) {
    this._ticks += elapsed;
    if (this._ticks >= this._interval) {
      this._ticks -= this._interval;
      if (this._callback) {
        this._callback();
      }
      return true;
    }
    return false;
  }
}

export const Services = class {
  enable() {
    this._destroyed = false;
    this._mounts = {};
    this._mountsVersion = 0;
    this._trashCheckInFlight = false;
    this._services = [
      new ServiceCounter(
        'clock',
        1000 * 60,
        () => {
          this.extension.docks.forEach((d) => {
            d._onClock();
          });
        },
        -1
      ),
      new ServiceCounter(
        'calendar',
        1000 * 60 * 15,
        () => {
          this.extension.docks.forEach((d) => {
            d._onCalendar();
          });
        },
        -1
      ),
      new ServiceCounter(
        'ping',
        1000 * 5,
        () => {
          this._commitMounts();
          if (
            Main.messageTray.getSources().length > 0 ||
            (this._appNotices && Object.keys(this._appNotices).length > 0)
          ) {
            this.checkNotifications();
          }
        },
        0
      ),
    ];

    this._disableNotifications = 0;

    this._deferredMounts = [];
    this._volumeMonitor = Gio.VolumeMonitor.get();
    this._volumeMonitor.connectObject(
      'mount-added',
      this._onMountAdded.bind(this),
      'mount-removed',
      this._onMountRemoved.bind(this),
      this
    );

    this.setupTrash();
    this.setupDownloads();

    this.checkNotifications();

    this.checkMounts();
    this._commitMounts();
  }

  disable() {
    this._destroyed = true;
    this._downloadsMonitor?.disconnectObject(this);
    this._downloadsMonitor = null;
    this._downloadsDir = null;
    this._services = [];
    this._volumeMonitor?.disconnectObject(this);
    this._volumeMonitor = null;
    this._trashMonitor?.disconnectObject(this);
    this._trashMonitor = null;
    this._trashDir = null;
  }

  setupTrash() {
    if (this._trashMonitor) {
      this._trashMonitor.disconnectObject(this);
      this._trashMonitor = null;
    }
    this._trashDir = null;
    if (!this.extension.trash_icon) {
      this.trashFull = false;
      return;
    }
    this._trashDir = Gio.File.new_for_uri('trash:///');
    this._trashMonitor = this._trashDir.monitor(
      Gio.FileMonitorFlags.WATCH_MOVES,
      null
    );
    this._trashMonitor.connectObject(
      'changed',
      (fileMonitor, file, otherFile, eventType) => {
        switch (eventType) {
          case Gio.FileMonitorEvent.CHANGED:
          case Gio.FileMonitorEvent.CREATED:
          case Gio.FileMonitorEvent.MOVED_IN:
            return;
        }
        this.checkTrash();
      },
      this
    );
    this.checkTrash();
  }

  setupDownloads() {
    if (this._downloadsMonitor) {
      this._downloadsMonitor.disconnectObject(this);
      this._downloadsMonitor = null;
    }
    this._downloadsDir = null;
    if (!this.extension.downloads_icon) {
      return;
    }
    this._downloadsUserDir = this.extension.downloads_path;
    let fn = Gio.File.new_for_path(this._downloadsUserDir);
    if (!fn.query_exists(null)) {
      this._downloadsUserDir = null;
    }
    if (this._downloadsUserDir) {
      this._downloadsDir = Gio.File.new_for_path(this._downloadsUserDir);
    } else {
      this._downloadsDir = Gio.File.new_for_path('Downloads');
    }

    this._downloadsMonitor = this._downloadsDir.monitor(
      Gio.FileMonitorFlags.WATCH_MOVES,
      null
    );
    this._downloadsMonitor.connectObject(
      'changed',
      (fileMonitor, file, otherFile, eventType) => {
        switch (eventType) {
          case Gio.FileMonitorEvent.CHANGED:
          case Gio.FileMonitorEvent.CREATED:
          case Gio.FileMonitorEvent.MOVED_IN:
            return;
        }
        this._debounceCheckDownloads();
      },
      this
    );

    this._debounceCheckDownloads();
  }

  _commitMounts() {
    if (this._deferredMounts && this._deferredMounts.length) {
      let mounts = [...this._deferredMounts];
      this._deferredMounts = [];
      mounts.forEach((m) => {
        this._onMountAdded(null, m);
      });
    }
  }

  _onMountAdded(monitor, mount) {
    if (!this.extension.mounted_icon) {
      return false;
    }

    this.last_mounted = mount;
    let basename = this._getMountName(mount);
    this.setupMountIcon(mount);
    this.extension.animate();
    return true;
  }

  _onMountRemoved(monitor, mount) {
    let basename = this._getMountName(mount);
    let appname = `mount-${this._toSafeFileName(
      basename
    )}-fluid-glass-dock.desktop`;
    let mount_id = tempPath(appname);
    delete this._mounts[mount_id];
    this._mountsVersion++;
    this.extension.animate();
  }

  update(elapsed) {
    this._services.forEach((s) => {
      s.update(elapsed);
    });
  }

  setupTrashIcon() {
    let extension_path = this.extension.path;
    let appname = `trash-fluid-glass-dock.desktop`;
    let app_id = tempPath(appname);
    let fn = Gio.File.new_for_path(app_id);
    let open_app = 'nautilus --select';

    let trash_action = `${extension_path}/apps/empty-trash.sh`;
    {
      let fn = Gio.File.new_for_path('.local/share/Trash');
      trash_action = `rm -rf "${fn.get_path()}"`;
    }

    let content = `[Desktop Entry]\nVersion=1.0\nTerminal=false\nType=Application\nName=Trash\nExec=${open_app} trash:///\nIcon=user-trash\nStartupWMClass=trash-fluid-glass-dock\nActions=trash\n\n[Desktop Action trash]\nName=Empty Trash\nExec=${trash_action}\nTerminal=true\n`;
    const [, etag] = fn.replace_contents(
      content,
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null
    );
  }

  setupFolderIcon(name, title, icon, path) {
    let full_path = Gio.file_new_for_path(path).get_path();
    let extension_path = this.extension.path;
    let appname = `${name}-fluid-glass-dock.desktop`;
    let app_id = tempPath(appname);
    let fn = Gio.File.new_for_path(app_id);
    let open_app = 'nautilus --select';

    let content = `[Desktop Entry]\nVersion=1.0\nTerminal=false\nType=Application\nName=${title}\nExec=${open_app} ${full_path}\nIcon=${icon}\nStartupWMClass=${name}-fluid-glass-dock\n`;
    const [, etag] = fn.replace_contents(
      content,
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null
    );
  }

  setupFolderIcons() {
    this.setupTrashIcon();
    this.setupFolderIcon(
      'downloads',
      'Downloads',
      'folder-downloads',
      'Downloads'
    );
    this.setupFolderIcon(
      'documents',
      'Documents',
      'folder-documents',
      'Documents'
    );
  }

  _toSafeFileName(name) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  setupMountIcon(mount) {
    let basename = this._getMountName(mount);
    if (basename.startsWith('/')) {
    }
    let label = mount.get_name();
    let appname = `mount-${this._toSafeFileName(
      basename
    )}-fluid-glass-dock.desktop`;
    let fullpath = mount.get_default_location().get_path();
    let icon = 'drive-harddisk-solidstate';
    if (mount.get_icon() && mount.get_icon().names) {
      icon =
        this.extension.lookup_icon_from_names(mount.get_icon().names) ?? icon;
    }
    let mount_exec = 'echo "not implemented"';
    let unmount_exec = `umount ${fullpath}`;
    let mount_id = tempPath(appname);
    let fn = Gio.File.new_for_path(mount_id);

    if (!fn.query_exists(null)) {
      let content = `[Desktop Entry]\nVersion=1.0\nTerminal=false\nType=Application\nName=${label}\nExec=xdg-open ${fullpath}\nIcon=${icon}\nStartupWMClass=mount-${this._toSafeFileName(
        basename
      )}-fluid-glass-dock\nActions=unmount;\n\n[Desktop Action mount]\nName=Mount\nExec=${mount_exec}\n\n[Desktop Action unmount]\nName=Unmount\nExec=${unmount_exec}\n`;
      const [, etag] = fn.replace_contents(
        content,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
    }

    this._mounts[mount_id] = mount;
    this._mountsVersion++;
  }

  checkNotifications() {
    if (this._disableNotifications > 4) return;

    let sources = Main.messageTray.getSources();
    this._appNotices = this._appNotices || {};

    Object.keys(this._appNotices).forEach((k) => {
      this._appNotices[k].previous = this._appNotices[k].count;
      this._appNotices[k].count = 0;
    });

    let app_map = {
      'org.gnome.Evolution-alarm-notify.desktop': 'org.gnome.Calendar.desktop',
    };

    sources.forEach((source) => {
      let appId = null;
      if (source.app) {
        appId = source.app.get_id();
      }
      if (!appId && source._app) {
        appId = source._app.get_id();
      }
      if (!appId) {
        appId = source._appId;
      }
      if (!appId) {
        appId = '?';
      }

      appId = app_map[appId] || appId;

      if (!this._appNotices[appId]) {
        this._appNotices[appId] = {
          count: 0,
          previous: 0,
          urgency: 0,
          source: source,
        };
      }
      this._appNotices[appId].count = source.count;
      this._appNotices[`${appId}`] = this._appNotices[appId];
      if (!appId.endsWith('desktop')) {
        this._appNotices[`${appId}.desktop`] = this._appNotices[appId];
      }
    });

    let hasUpdates = false;
    Object.keys(this._appNotices).forEach((k) => {
      if (this._appNotices[k].previous != this._appNotices[k].count) {
        hasUpdates = true;
      }
    });

    let update = {};
    Object.keys(this._appNotices).forEach((k) => {
      if (this._appNotices[k].count > 0) {
        update[k] = this._appNotices[k];
      }
    });
    this._appNotices = update;

    if (hasUpdates) {
      this.extension.animate();
    }
  }

  checkTrash() {
    if (!this.extension.trash_icon || !this._trashDir || this._trashCheckInFlight)
      return;
    this._trashCheckInFlight = true;
    this._trashDir.enumerate_children_async(
      'standard::name',
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_LOW,
      null,
      (dir, res) => {
        try {
          const iter = dir.enumerate_children_finish(res);
          if (!iter || this._destroyed) {
            this._trashCheckInFlight = false;
            return;
          }
          iter.next_files_async(1, GLib.PRIORITY_LOW, null, (en, fRes) => {
            this._trashCheckInFlight = false;
            try {
              const files = en.next_files_finish(fRes);
              en.close_async(GLib.PRIORITY_LOW, null, null);
              if (this._destroyed || !this.extension)
                return;
              const prev = this.trashFull;
              this.trashFull = files != null && files.length > 0;
              if (prev != this.trashFull) {
                this.extension.animate({ refresh: true });
              }
            } catch (_e) {
            }
          });
        } catch (_e) {
          this._trashCheckInFlight = false;
        }
      }
    );
  }

  checkRecentFilesInFolder(path) {
    let maxs = [5, 8, 10, 12, 15, 20, 25];
    let max_recent_items = maxs[this.extension?.max_recent_items || 0];
    let downloadFiles = [];
    let directory = Gio.File.new_for_path(path);
    const attrs = [
      Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
      Gio.FILE_ATTRIBUTE_STANDARD_NAME,
      Gio.FILE_ATTRIBUTE_STANDARD_ICON,
      Gio.FILE_ATTRIBUTE_TIME_MODIFIED,
    ].join(',');

    return new Promise((resolve, reject) => {
      directory.enumerate_children_async(
        attrs,
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_LOW,
        null,
        (dir, res) => {
          let enumerator;
          try {
            enumerator = dir.enumerate_children_finish(res);
          } catch (err) {
            reject(err);
            return;
          }
          const readBatch = () => {
            if (this._destroyed || !this.extension) {
              try {
                enumerator.close_async(GLib.PRIORITY_LOW, null, null);
              } catch (_e) {}
              resolve([[], 0]);
              return;
            }
            enumerator.next_files_async(64, GLib.PRIORITY_LOW, null, (en, fRes) => {
              let infos;
              try {
                infos = en.next_files_finish(fRes);
              } catch (err) {
                try {
                  en.close_async(GLib.PRIORITY_LOW, null, null);
                } catch (_e) {}
                reject(err);
                return;
              }
              if (!infos || infos.length === 0) {
                try {
                  en.close_async(GLib.PRIORITY_LOW, null, null);
                } catch (_e) {}
                let downloadFilesLength = downloadFiles.length;
                downloadFiles.sort((a, b) => (a.date.tv_sec > b.date.tv_sec ? -1 : 1));
                for (let i = 0; i < downloadFiles.length; i++) {
                  downloadFiles[i].index = i;
                }
                downloadFiles.splice(max_recent_items);
                resolve([downloadFiles, downloadFilesLength]);
                return;
              }
              for (let i = 0; i < infos.length; i++) {
                let fileInfo = infos[i];
                let fileName = fileInfo.get_name();
                let fileModified = fileInfo.get_modification_time();
                let icon = 'file';
                if (fileInfo.get_icon() && fileInfo.get_icon().names) {
                  icon =
                    this.extension.lookup_icon_from_names(fileInfo.get_icon().names) ??
                    icon;
                }
                downloadFiles.push({
                  index: 0,
                  name: fileName,
                  display: fileName,
                  icon: icon,
                  type: fileInfo.get_content_type(),
                  path: [path, fileName].join('/'),
                  date: fileModified ?? { tv_sec: 0 },
                  fileInfo: fileInfo,
                });
              }
              readBatch();
            });
          };
          readBatch();
        }
      );
    });
  }

  async checkRecents() {
  }

  _debounceCheckRecents() {
    if (this.extension._loTimer) {
      if (!this._debounceRecentsSeq) {
        this._debounceRecentsSeq = this.extension._loTimer.runDebounced(
          () => {
            this.checkRecents();
          },
          DEBOUNCE_CHECK_TIMEOUT,
          'debounceCheckRecents'
        );
      } else {
        this.extension._loTimer.runDebounced(this._debounceRecentsSeq);
      }
    }
  }

  async checkDownloads() {
    if (!this.extension?.downloads_icon || !this._downloadsDir)
      return;
    try {
      let path = this._downloadsDir.get_path();
      [this._downloadFiles, this._downloadFilesLength] =
        await this.checkRecentFilesInFolder(path);
    } catch (err) {
      console.log(err);
    }
  }

  _debounceCheckDownloads() {
    if (!this.extension?.downloads_icon)
      return;
    if (this.extension._loTimer) {
      if (!this._debounceDownloadsSeq) {
        this._debounceDownloadsSeq = this.extension._loTimer.runDebounced(
          () => {
            this.checkDownloads();
          },
          DEBOUNCE_CHECK_TIMEOUT,
          'debounceCheckDownloads'
        );
      } else {
        this.extension._loTimer.runDebounced(this._debounceDownloadsSeq);
      }
    }
  }

  _getMountName(mount) {
    let name = null;
    if (mount.get_drive()) {
      name = mount.get_drive().get_name();
    }

    if (!name) {
      if (mount.get_volume()) {
        name = mount.get_volume().get_name();
      }
    }

    if (!name) {
      if (mount.get_default_location()) {
        name = mount.get_default_location().get_basename();
      }
    }

    return 'Volume';
  }

  checkMounts() {
    if (!this.extension.mounted_icon) {
      this._mounts = {};
      this._mountsVersion++;
      return;
    }

    let mounts = this._volumeMonitor.get_mounts() || [];
    let mount_ids = mounts.map((mount) => {
      let basename = this._getMountName(mount);
      let appname = `mount-${this._toSafeFileName(
        basename
      )}-fluid-glass-dock.desktop`;
      return appname;
    });

    this.mounts = mounts;
    mounts.forEach((mount) => {
      let basename = this._getMountName(mount);
      let appname = `mount-${this._toSafeFileName(
        basename
      )}-fluid-glass-dock.desktop`;
      this._deferredMounts.push(mount);
    });

  }

  updateIcon(item, settings) {
    if (!item) {
      return;
    }
    let icon = item._icon;
    if (!icon || !icon.icon_name) {
      return;
    }

    let { scaleFactor, iconSize, dock } = settings;

    if (this.extension.trash_icon && icon.icon_name.startsWith('user-trash')) {
      let new_icon = this.trashFull ? 'user-trash-full' : 'user-trash';
      if (new_icon != icon.icon_name) {
        icon.icon_name = new_icon;
      }
    }

    if (icon.icon_name == 'org.gnome.clocks') {
      if (this.extension.clock_icon) {
        let clock = item._clock;
        if (!clock) {
          clock = new Clock(CANVAS_SIZE, dock.extension._widgetStyle);
          dock._clock = clock;
          item._clock = clock;
          item._image = clock;
          dock.renderArea.add_child(clock);
        }
        if (clock) {
          clock._icon = icon;
          clock.width = item._renderer.width * item._renderer.scaleX;
          clock.height = clock.width;
          let canvasScale = clock.width / (clock._canvas.width + 2);
          clock._canvas.set_scale(canvasScale, canvasScale);
          clock.x = item._renderer.x;
          clock.y = item._renderer.y;
          clock.opacity = item._renderer.opacity;
          clock.show();
          item._renderer.opacity = clock.shouldHideIcon() ? 0 : 255;
        }
      } else {
        let clock = item._clock;
        item._icon.visible = true;
        clock?.hide();
      }
    }

    if (icon.icon_name == 'org.gnome.Calendar') {
      if (this.extension.calendar_icon) {
        let calendar = item._calendar;
        if (!calendar) {
          calendar = new Calendar(CANVAS_SIZE, dock.extension._widgetStyle);
          dock._calendar = calendar;
          item._calendar = calendar;
          item._image = calendar;
          dock.renderArea.add_child(calendar);
        }
        if (calendar) {
          calendar._icon = icon;
          calendar.width = item._renderer.width * item._renderer.scaleX;
          calendar.height = calendar.width;
          let canvasScale = calendar.width / (calendar._canvas.width + 2);
          calendar._canvas.set_scale(canvasScale, canvasScale);
          calendar.x = item._renderer.x;
          calendar.y = item._renderer.y;
          calendar.opacity = item._renderer.opacity;
          calendar.show();
          item._renderer.opacity = calendar.shouldHideIcon() ? 0 : 255;
        }
      } else {
        let calendar = item._calendar;
        item._icon.visible = true;
        calendar?.hide();
      }
    }
  }
};
