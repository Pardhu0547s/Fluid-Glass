'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
const Point = Graphene.Point;

import { Dot } from './apps/dot.js';
import { DockPosition } from './dock.js';

import { DockItemDotsOverlay, DockItemBadgeOverlay } from './dockItems.js';
import {
  Bounce,
  Linear,
  CubicEaseOut,
  QuadraticEaseOut,
} from './effects/easing.js';
import {
  get_distance_sqr,
  get_distance,
  isInRect,
  isOverlapRect,
} from './utils.js';

const ANIM_POSITION_PER_SEC = 550 / 1000;
const ANIM_SIZE_PER_SEC = 250 / 1000;
const ANIM_ICON_RAISE = 0.5;
const ANIM_ICON_SCALE = 1.5;
const ANIM_ICON_HIT_AREA = 2.5;
const ANIMATE_CACHE_LOOKUP = 4;

const DOT_CANVAS_SIZE = 96;

export let Animator = class {
  enable() {
    if (!this._renderers) {
      this._renderers = [];
      this._dots = [];
      this._badges = [];
    }
    this._computed = null;
  }

  disable() {
    if (this._target) {
      this._target.remove_all_children();
    }
    if (!this._renderers) {
      this._renderers = [];
      this._dots = [];
      this._badges = [];
    }
  }

  _precreateResources(dock) {
    if (!dock._icons) {
      return false;
    }

    let count = dock._icons.length;
    if (dock.renderArea.get_children().length == 0) {
      this._renderers = [];
      this._dots = [];
      this._badges = [];
    }
    this._target = dock.renderArea;

    while (this._renderers.length < count) {
      let target = dock.renderArea;
      let renderer = new St.Icon({
        icon_name: 'file',
        name: 'fluidGlassDockIcon',
        reactive: true,
        icon_size: 24,
      });
      renderer.visible = false;
      target.add_child(renderer);
      this._renderers.push(renderer);

      let dots = new DockItemDotsOverlay(new Dot(DOT_CANVAS_SIZE));
      dots.visible = false;
      target.add_child(dots);
      this._dots.push(dots);

      let badge = new DockItemBadgeOverlay(new Dot(DOT_CANVAS_SIZE));
      badge.visible = false;
      target.add_child(badge);
      this._badges.push(badge);
    }

    for (let i = dock._icons.length; i < this._renderers.length; i++) {
      this._renderers[i].visible = false;
      this._dots[i].visible = false;
      this._badges[i].visible = false;
    }

    return true;
  }

  animate(dt) {
    let dock = this.dock;
    if (dock._hoveredIcon) {
      dock._lastHoveredIcon = dock._hoveredIcon;
    }

    let simulation = false;

    if (!dock.layout()) {
      console.log('unable to layout()');
      return;
    }

    if (!this._precreateResources(dock)) {
      return;
    }

    let didFadeIn = false;
    if (dock.opacity < 255) {
      let opacityPerSecond = 255 / 500;
      didFadeIn = true;
      let dst = 255 - dock.opacity;
      let mag = Math.abs(dst);
      let dir = Math.sign(dst);
      if (opacityPerSecond > mag / dt) {
        opacityPerSecond = mag / dt;
      }
      dock.opacity += Math.floor(opacityPerSecond * dt * dir);
      if (dock.renderArea.opacity < 255 && dock.opacity > 50) {
        dock.renderArea.opacity = dock.opacity;
      }
    }

    let m = dock.getMonitor();
    let pointer = global.get_pointer();

    if (dock.extension.simulated_pointer) {
      pointer = [...dock.extension.simulated_pointer];
      simulation = true;
    }
    if (dock.simulated_pointer) {
      pointer = [...dock.simulated_pointer];
      simulation = true;
    }
    if (
      dock._list &&
      dock._list.visible &&
      dock._list._box &&
      dock._lastHoveredIcon == dock._list._target
    ) {
      pointer[1] -= dock._iconSize * dock._scaleFactor;
    }

    let [px, py] = pointer;

    let vertical = dock.isVertical();
    let isWithin = dock._isWithinDash([px, py]);

    if (m.inFullscreen) {
      isWithin = false;
    }

    let animated = isWithin;
    dock.animated = animated;

    let animateIcons = dock._icons;
    let iconSize = dock._iconSizeScaledDown;
    let scaleFactor = dock._scaleFactor;

    let nearestIdx = -1;
    let nearestIcon = null;
    let nearestDistance = -1;

    let iconCenterOffset = (iconSize * scaleFactor) / 2;
    let hitArea = iconSize * ANIM_ICON_HIT_AREA * scaleFactor;
    hitArea *= hitArea;

    let idx = 0;
    let prevIcon = null;
    animateIcons.forEach((icon) => {
      if (!icon._icon) return;
      let pos = icon.get_transformed_position();

      if (icon._found && !icon._handled) {
        icon._handled = true;
        dock._maybeBounce(icon, true);
      }

      icon._pos = [...pos];
      icon._fixedPosition = [...pos];

      let bposcenter = [...pos];
      bposcenter[0] += iconCenterOffset;
      bposcenter[1] += iconCenterOffset;
      let dst = get_distance_sqr(pointer, bposcenter);

      if (
        isWithin &&
        (nearestDistance == -1 || nearestDistance > dst) &&
        dst < hitArea
      ) {
        nearestDistance = dst;
        nearestIcon = icon;
        nearestIdx = idx;
        icon._distance = dst;
      }

      icon._target = pos;
      icon._targetScale = 1;

      icon._idx = idx++;

      icon._prev = prevIcon;
      icon._next = null;
      if (prevIcon) {
        icon._next = icon;
      }
      prevIcon = icon;
    });

    let noAnimation = !dock.extension.animate_icons_unmute;
    if (dock._dragging) {
      noAnimation = true;
      isWithin = true;
    }
    if ((!simulation && !isWithin) || noAnimation) {
      nearestIcon = null;
    }
    dock._nearestIcon = nearestIcon;

    let didScale = false;
    let didBounce = false;

    let edge_distance = dock._edge_distance;
    let rise = dock.extension.animation_rise * ANIM_ICON_RAISE;
    let magnify = dock.extension.animation_magnify * ANIM_ICON_SCALE;
    let spread = dock.extension.animation_spread;

    if (spread < 0.2) {
      magnify *= 0.8;
    }
    if (magnify > 0.15 && spread < 0.55) {
      spread = 0.55 + spread * 0.2;
    }

    let threshold = (iconSize + 10) * 2.5 * scaleFactor;
    if (animated && edge_distance < 0) {
      edge_distance = 0;
    }

    let total_scale = 0;
    let did_scale_count = 0;

    let firstIcon = null;
    let lastIcon = null;
    let iconTable = [];

    let scaleAtMin = 1;
    let scaleAtMax = 1;
    if (magnify != 0) {
      scaleAtMax = 1 + magnify;
    }

    let Ease = QuadraticEaseOut;
    if (dock.extension.animation_rise_curve == 1) {
      Ease = CubicEaseOut;
    }

    animateIcons.forEach((icon) => {
      if (!icon._icon) return;
      let original_pos = [...icon._pos];

      icon._fixedPosition = [...original_pos];

      original_pos[0] += icon.width / 2;
      original_pos[1] += icon.height / 2;

      icon._pos = [...original_pos];
      icon._translate = 0;
      icon._translateRise = 0;

      iconTable.push(icon);
      if (firstIcon == null) {
        firstIcon = icon;
      }
      lastIcon = null;

      let scale = 1;
      let dx = original_pos[0] - px;
      if (vertical) {
        dx = original_pos[1] - py;
      }

      icon._hoverProgress = 0;
      if (dx * dx < threshold * threshold && nearestIcon) {
        let adx = Math.abs(dx);
        let hoverProgress = 1.0 - adx / threshold;
        icon._hoverProgress = hoverProgress;

        if (magnify != 0) {
          scale = scaleAtMax * Ease(hoverProgress);
          if (scale < 1) scale = 1;
        }

        let sz = iconSize * (scale - 1) * scaleFactor;
        icon._translateRise = sz * rise;
        didScale = true;

        total_scale += scale;
        did_scale_count += 1;
      }

      icon._scale = scale;
      icon._targetScale = scale;

      if (
        icon._icon.gicon &&
        icon._icon.gicon.file != null &&
        !icon._icon.gicon.file?.get_path()?.toLowerCase().endsWith('svg')
      ) {
      } else {
        icon._icon.set_scale(scale, scale);
      }

      if (!icon._pos) {
        return;
      }
    });

    let largestIconScale = 1;

    let total_spread_left = 0;
    let total_spread_right = 0;
    let hoveredIcon = dock._lastHoveredIcon;
    for (let i = 0; i < iconTable.length; i++) {
      if (iconTable.length < 2) break;
      let icon = iconTable[i];

      if (icon._targetScale > largestIconScale) {
        largestIconScale = icon._targetScale;
        hoveredIcon = icon;
      }

      let scale = icon._scale;
      if (scale > 1.1) {
        let offset = Math.floor(
          1.25 * (scale - 1) * iconSize * scaleFactor * spread * 0.5
        );
        for (let j = i - 1; j >= 0; j--) {
          let left = iconTable[j];
          left._translate -= offset;
          total_spread_left += offset;
        }
        for (let j = i + 1; j < iconTable.length; j++) {
          let right = iconTable[j];
          right._translate += offset;
          total_spread_right += offset;
        }
      }
    }

    dock._hoveredIcon = hoveredIcon;
    let TRANSLATE_COEF = 24;
    if (nearestIcon) {
      nearestIcon._targetScale += 0.1;
      let adjust = nearestIcon._translate / 2;
      animateIcons.forEach((icon) => {
        if (!icon._icon) return;
        if (icon._scale > 1) {
          let o = -adjust * (2 - icon._scale);
          let nt = icon._translate - o;
          icon._translate =
            (icon._translate * TRANSLATE_COEF + nt) / (TRANSLATE_COEF + 1);
        }
      });
    }

    let renderOffset = dock.renderArea.get_transformed_position();

    let first = animateIcons[0];
    let last = animateIcons[animateIcons.length - 1];

    let slowDown = dock.extension._config.speed_up || 1;
    if (!didScale) {
      slowDown = 0.5;
    }

    let lockPosition =
      didScale && first && last && first._hoverProgress == 0 && last._hoverProgress == 0;

    if (dock._preview) {
      lockPosition = false;
    }

    let didMoveIcons = false;

    animateIcons.forEach((icon) => {
      if (!icon._icon) return;
      if (icon._targetScale > 1.9) icon._targetScale = 2;

      icon._scale = icon._targetScale;

      const isTopOrLeft =
        dock._position === DockPosition.TOP ||
        dock._position === DockPosition.LEFT;
      const riseDirection = isTopOrLeft ? 1 : -1;

      let translationX;
      let translationY;
      if (vertical) {
        translationX = icon._translateRise * riseDirection;
        translationY = icon._translate;
      } else {
        translationX = icon._translate;
        translationY = icon._translateRise * riseDirection;
      }

      let curX = icon._icon.translationX;
      let curY = icon._icon.translationY;
      {
        let speed = ANIM_POSITION_PER_SEC * slowDown;
        let dx = translationX - curX;
        let dy = translationY - curY;
        let mag = Math.hypot(dx, dy);
        if (mag > 0.25) {
          didMoveIcons = true;
          let step = speed * dt;
          if (step < mag) {
            let k = step / mag;
            translationX = curX + dx * k;
            translationY = curY + dy * k;
          }
        }
      }

      if (lockPosition && icon._hoverProgress == 0) {
        icon._positionCache = icon._positionCache || [];
        var lockThreshold = 48;
        if (
          (icon._prev && icon._prev._locked) ||
          (icon._next && icon._next._locked)
        ) {
          lockThreshold = 32;
        }
        if (icon._positionCache.length > lockThreshold) {
          [translationX, translationY] =
            icon._positionCache[icon._positionCache.length - 1];
          icon._locked = true;
        } else {
          icon._positionCache.push([translationX, translationY]);

          let edgeItems = ANIMATE_CACHE_LOOKUP;
          if (icon._positionCache.length > edgeItems) {
            let tx = 0;
            let ty = 0;
            for (let i = 0; i < edgeItems; i++) {
              tx +=
                icon._positionCache[
                  icon._positionCache.length - edgeItems + i
                ][0];
              ty +=
                icon._positionCache[
                  icon._positionCache.length - edgeItems + i
                ][1];
            }
            translationX = tx / edgeItems;
            translationY = ty / edgeItems;
          }
        }
      } else {
        icon._positionCache = null;
      }

      if (dock.animation_fps > 0) {
        if (curX !== translationX) icon._icon.translationX = translationX;
        if (curY !== translationY) icon._icon.translationY = translationY;
      } else {
        let nextX = Math.abs(translationX - curX) < 0.25 ? translationX : (curX + translationX * 3) / 4;
        let nextY = Math.abs(translationY - curY) < 0.25 ? translationY : (curY + translationY * 3) / 4;
        if (Math.abs(nextX - curX) > 0.05 || Math.abs(nextY - curY) > 0.05) {
          didMoveIcons = true;
        }
        if (curX !== nextX) icon._icon.translationX = nextX;
        if (curY !== nextY) icon._icon.translationY = nextY;
      }

      if (icon._appwell) {
        if (icon._appwell.translationY !== 0) icon._appwell.translationY = 0;
        if (icon._appwell._bounce) didBounce = true;
        icon._appwell._bounce = false;
      }
    });

    animateIcons.forEach((icon) => {
      if (!icon._icon) return;
      {
        let icon_name = icon._icon.icon_name;
        let app_name =
          icon._appwell?.app?.app_info?.get_id()?.replace('.desktop', '') ??
          null;
        let gicon = null;

        if (dock.extension.icon_map || dock.extension.app_map) {
          if (
            dock.extension.icon_map_cache &&
            dock.extension.icon_map_cache[icon_name]
          ) {
            gicon = dock.extension.icon_map_cache[icon_name];
          }
          if (
            !gicon &&
            dock.extension.icon_map &&
            dock.extension.icon_map[icon_name]
          ) {
            icon_name = dock.extension.icon_map[icon_name];
          }

          if (
            app_name &&
            dock.extension.app_map_cache &&
            dock.extension.app_map_cache[app_name]
          ) {
            gicon = dock.extension.app_map_cache[app_name];
          }
          if (
            !gicon &&
            dock.extension.app_map &&
            app_name &&
            dock.extension.app_map[app_name]
          ) {
            icon_name = dock.extension.app_map[app_name];
          }
        }

        icon._renderer = this._renderers[icon._idx];
        icon._renderer._icon = icon._icon;
        if (icon._renderer.style_class) {
          icon._renderer.set_style_class_name('');
        }

        if (!icon._appwell?._bounce) {
          if (icon._renderer.translationX !== 0) icon._renderer.translationX = 0;
          if (icon._renderer.translationY !== 0) icon._renderer.translationY = 0;
        }

        let renderer = icon._renderer;
        if (gicon) {
          if (renderer.gicon !== gicon) {
            renderer.gicon = gicon;
          }

          if (icon._icon.gicon && icon._icon.gicon.file && icon._icon.gicon !== gicon) {
            icon._icon.gicon = gicon;
          }
        } else {
          if (icon_name) {
            if (renderer.gicon !== null || renderer.icon_name !== icon_name) {
              renderer.icon_name = icon_name;
            }
          } else {
            if (icon._icon.gicon && renderer.gicon !== icon._icon.gicon) {
              renderer.gicon = icon._icon.gicon;
            }
          }
        }

        let unscaledIconSize = dock._iconSizeScaledDown * scaleFactor;
        let targetSize = unscaledIconSize * icon._targetScale;
        let currentSize = renderer.icon_size * renderer.scaleX;
        {
          let dst = targetSize - currentSize;
          let mag = Math.abs(dst);
          let dir = Math.sign(dst);
          let pixelOverTime = ANIM_SIZE_PER_SEC * slowDown;
          let appliedSize = pixelOverTime * dir * dt;
          if (mag < 0.35) {
            appliedSize = dst;
          } else {
            didMoveIcons = true;
            if (Math.abs(appliedSize) > mag) {
              appliedSize = dst * 0.5;
            }
          }
          targetSize = currentSize + appliedSize;
          icon._deltaSize = appliedSize;
          icon._targetSize = targetSize;
        }
        icon._scale = targetSize / unscaledIconSize;

        let baseSize = 32 * (dock.extension.icon_quality || 1);
        if (renderer.icon_size != baseSize) {
          renderer.set_size(baseSize, baseSize);
          renderer.set_icon_size(baseSize);
        }
        let scaleToTarget = targetSize / baseSize;
        if (renderer.scaleX !== scaleToTarget || renderer.scaleY !== scaleToTarget) {
          renderer.set_scale(scaleToTarget, scaleToTarget);
        }

        let p = icon._fixedPosition;
        let adjustX = icon.width / 2 - targetSize / 2;
        let adjustY = icon.height / 2 - targetSize / 2;

        if (targetSize > icon.height) {
          let rise = (targetSize - icon.height) * 0.5;
          if (vertical) {
            adjustX += rise * (dock._position == 'left' ? 1 : -1);
          } else {
            adjustY += rise * (dock._position == 'bottom' ? -1 : 1);
          }
        }

        if (p && !isNaN(p[0]) && !isNaN(p[1])) {
          let iconContainer = icon._icon.get_parent();
          if (iconContainer) {
            if (vertical) {
              let cx = adjustX / 2;
              if (iconContainer.translationX !== cx) iconContainer.translationX = cx;
            } else {
              let cy = adjustY / 2;
              if (iconContainer.translationY !== cy) iconContainer.translationY = cy;
            }

            let rx = p[0] + adjustX + icon._icon.translationX - renderOffset[0];
            let ry = p[1] + adjustY + icon._icon.translationY - renderOffset[1];
            if (renderer.x !== rx || renderer.y !== ry) {
              renderer.set_position(rx, ry);
            }

            if (!renderer.visible) {
              renderer.visible = true;
            }
          }
          icon._px = p[0] - renderOffset[0];
          icon._py = p[1] - renderOffset[1];
        }

        if (icon._label) {
          if (icon._label.opacity !== 0) icon._label.opacity = 0;
          if (icon._label.visible) {
            icon._label.hide();
          }
        }

        let targetOpacity =
          icon._icon == dock._dragged && dock._dragging ? 75 : 255;
        if (renderer.opacity !== targetOpacity) {
          renderer.opacity = targetOpacity;
        }
      }

      let badge = this._badges[icon._idx];
      let showBadge = false;
      if (badge && icon != dock._dragged) {
        let appNotices = icon._appwell
          ? dock.extension.services._appNotices[icon._appwell.app.get_id()]
          : null;
        let noticesCount = appNotices ? appNotices.count : 0;
        if (noticesCount > 0) {
          showBadge = true;
          badge.update(icon, {
            noticesCount,
            position: dock._position,
            vertical,
            extension: dock.extension,
          });

          let bw = icon._renderer.width * icon._renderer.scaleX;
          if (badge.width !== bw) badge.width = bw;
          if (badge.height !== bw) badge.height = bw;
          if (badge.x !== icon._renderer.x) badge.x = icon._renderer.x;
          if (badge.y !== icon._renderer.y) badge.y = icon._renderer.y;
          if (badge.scaleX !== icon._scale || badge.scaleY !== icon._scale) {
            badge.set_scale(icon._scale, icon._scale);
          }
        }
      }
      if (badge && badge.visible !== showBadge) {
        badge.visible = showBadge;
      }

      let dots = this._dots[icon._idx];
      let showDots = false;
      if (
        dots &&
        icon != dock._dragged &&
        icon._appwell &&
        icon._appwell.app &&
        icon._appwell.app.get_n_windows
      ) {
        let appCount = dock.getAppWindowsFiltered(icon._appwell.app).length;
        if (appCount > 0) {
          showDots = true;
          dots.update(icon, {
            appCount,
            position: dock._position,
            vertical,
            extension: dock.extension,
            dock,
          });

          let dw = icon._renderer.width * icon._renderer.scaleX;
          if (dots.width !== dw) dots.width = dw;
          if (dots.height !== dw) dots.height = dw;
          if (dots.x !== icon._renderer.x) dots.x = icon._renderer.x;
          if (dots.y !== icon._renderer.y) dots.y = icon._renderer.y;
          if (dots.scaleX !== icon._scale || dots.scaleY !== icon._scale) {
            dots.set_scale(icon._scale, icon._scale);
          }
        }
      }
      if (dots && dots.visible !== showDots) {
        dots.visible = showDots;
      }

      if (dock.extension.services) {
        dock.extension.services.updateIcon(icon, {
          scaleFactor,
          iconSize,
          dock,
        });
      }
    });

    dock._separators.forEach((actor) => {
      let prev = actor._prev;
      let next = actor._next;
      let tx = actor.translationX;
      let ty = actor.translationY;
      if (prev && next && prev._icon && next._icon) {
        tx = (prev._icon.translationX + next._icon.translationX) / 2;
        ty = (prev._icon.translationY + next._icon.translationY) / 2;
        let thickness = dock.extension.separator_thickness || 0;
        let sw = vertical ? iconSize * 0.5 * scaleFactor : thickness + 0.5;
        let sh = vertical ? thickness + 0.5 : iconSize * 0.75 * scaleFactor;
        if (actor.width !== sw) actor.width = sw;
        if (actor.height !== sh) actor.height = sh;
        let vis = thickness > 0;
        if (actor.visible !== vis) actor.visible = vis;
      }

      let any = next ?? prev;
      if (!vertical && any) {
        ty = (any.y + any.height / 2) - (actor.y + actor.height / 2);
      } else if (vertical && any) {
        tx += (any.x + any.width / 2) - (actor.x + actor.width / 2);
      }
      if (actor.translationX !== tx) actor.translationX = tx;
      if (actor.translationY !== ty) actor.translationY = ty;
    });

    let targetX = 0;
    let targetY = 0;
    if (dock._hidden && dock.extension.autohide_dash) {
      if (isWithin) {
        dock.slideIn();
      }
    }

    const edgeDirectionMultiplier =
      dock._position == DockPosition.BOTTOM ||
      dock._position == DockPosition.RIGHT
        ? 1
        : -1;

    if (dock._hidden) {
      if (vertical) {
        if (dock._position == DockPosition.LEFT) {
          targetX =
            -(dock._background.width + edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        } else {
          targetX =
            (dock._background.width - edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        }
      } else {
        if (dock._position == DockPosition.BOTTOM) {
          targetY =
            (dock._background.height - edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        } else {
          targetY =
            -(dock._background.height + edge_distance * -edgeDirectionMultiplier * 2) * scaleFactor;
        }
      }
    }

    if (vertical) {
      targetX += edge_distance * -edgeDirectionMultiplier;
    } else {
      targetY += edge_distance * -edgeDirectionMultiplier;
    }

    let didSlide = false;
    {
      let speed = Math.min(
        1,
        (150 + 300 * dock.extension.autohide_speed * scaleFactor) / 1000
      );
      let curX = dock.dash.translationX;
      let curY = dock.dash.translationY;
      let dx = targetX - curX;
      let dy = targetY - curY;
      let mag = Math.hypot(dx, dy);
      let translationX = targetX;
      let translationY = targetY;
      if (mag >= 0.35) {
        didSlide = true;
        translationX = curX + dx * speed;
        translationY = curY + dy * speed;
      }

      if (curX !== translationX) dock.dash.translationX = translationX;
      if (curY !== translationY) dock.dash.translationY = translationY;
    }

    {
      if (dock._background.style !== dock.extension._backgroundStyle) {
        dock._background.style = dock.extension._backgroundStyle;
      }
      dock._background.update({
        first,
        last,
        iconSize: dock._iconSizeScaledDown,
        scaleFactor,
        position: dock._position,
        vertical: vertical,
        panel_mode: dock.extension.panel_mode,
        dock,
      });

      let sx, sy, sw, sh;
      if (vertical) {
        sw =
          dock._background.width +
          iconSize * 0.2 * scaleFactor +
          edge_distance -
          dock._background._padding * scaleFactor;
        sh = dock.height;
        sy = dock.struts.y;

        if (dock.extension.autohide_dash) {
          sy = dock._background.y + dock._monitor.y;
          sh = dock._background.height;
        }

        if (dock._position == DockPosition.RIGHT) {
          sx = dock.x + dock.width - sw;
        } else {
          sx = dock.x;
        }
      } else {
        sw = dock.width;
        sh =
          dock._background.height +
          iconSize * 0.2 * scaleFactor +
          edge_distance -
          dock._background._padding * scaleFactor;
        sx = dock.struts.x;

        if (dock.extension.autohide_dash) {
          sx = dock._background.x + dock._monitor.x;
          sw = dock._background.width;
        }

        if (dock._position == DockPosition.BOTTOM) {
          sy = dock.y + dock.height - sh;
        } else {
          sy = dock.y;
        }
      }

      if (dock.struts.width !== sw) dock.struts.width = sw;
      if (dock.struts.height !== sh) dock.struts.height = sh;
      if (dock.struts.x !== sx) dock.struts.x = sx;
      if (dock.struts.y !== sy) dock.struts.y = sy;

      dock._updateTransparenies();
    }

    const strutsVis = !dock._hidden;
    if (dock.struts.visible !== strutsVis) dock.struts.visible = strutsVis;
    if (dock.dash.opacity !== 255) dock.dash.opacity = 255;

    if (dock._list && dock._list.visible && dock._list._target) {
      dock._list.animate(dt);
      didScale = true;
    }

    const tooltipIcon = isWithin
      ? (nearestIcon ?? animateIcons.find((i) => i._icon?.hover) ?? null)
      : null;
    if (this._updateTooltip(dock, tooltipIcon, m, dt)) {
      didScale = true;
    }

    dock.extension.integrations.bms_update_size(this);

    if (
      didFadeIn ||
      didScale ||
      didSlide ||
      didMoveIcons ||
      dock._dragging ||
      didBounce ||
      dock._preview
    ) {
      dock.autohider._debounceCheckHide();
      dock._debounceEndAnimation();
    } else if (!isWithin && !dock._fast_forward) {
      dock._endAnimation();
    }
  }

  _updateTooltip(dock, tooltipIcon, monitor, dt) {
    const hideLabels = Boolean(dock.extension.hide_labels);
    const menuOpen = Boolean(tooltipIcon?._appwell?._menu?.isOpen || dock._list?.visible);
    if (
      !tooltipIcon ||
      !tooltipIcon._renderer ||
      hideLabels ||
      menuOpen ||
      dock._dragging ||
      dock._hidden ||
      dock.opacity < 40 ||
      !dock._tooltip
    ) {
      this._dwellTick = 0;
      this._dwellIcon = null;
      dock._tooltip?.hideTooltip();
      return false;
    }

    const text =
      tooltipIcon._label?.text ||
      tooltipIcon._appwell?.app?.get_name?.() ||
      tooltipIcon.toggleButton?.accessible_name ||
      '';
    if (!text.length) {
      this._dwellTick = 0;
      this._dwellIcon = null;
      dock._tooltip.hideTooltip();
      return false;
    }

    if (this._dwellIcon !== tooltipIcon) {
      this._dwellIcon = tooltipIcon;
      if (!dock._tooltip.isActive) {
        this._dwellTick = 0;
      }
    } else {
      this._dwellTick = (this._dwellTick || 0) + dt;
    }

    if (this._dwellTick < 220 && !dock._tooltip.isActive) {
      return true;
    }

    const renderer = tooltipIcon._renderer;
    const tPos = renderer.get_transformed_position();
    const tSize = renderer.get_transformed_size();
    if (
      ![tPos[0], tPos[1], tSize[0], tSize[1]].every(Number.isFinite) ||
      tSize[0] <= 0 ||
      tSize[1] <= 0
    ) {
      return false;
    }

    let dockRect = null;
    if (dock._background?.mapped) {
      const bPos = dock._background.get_transformed_position();
      const bSize = dock._background.get_transformed_size();
      if (
        [bPos[0], bPos[1], bSize[0], bSize[1]].every(Number.isFinite) &&
        bSize[0] > 0 &&
        bSize[1] > 0
      ) {
        dockRect = [bPos[0], bPos[1], bSize[0], bSize[1]];
      }
    }

    dock._tooltip.showTooltip(
      text,
      [tPos[0], tPos[1], tSize[0], tSize[1]],
      dock._position,
      monitor,
      dockRect
    );
    return false;
  }

  bounceIcon(appwell) {
    let dock = this.dock;
    let app_id = appwell._id;

    let travel =
      (dock._iconSize / 3) *
      ((0.25 + dock.extension.animation_bounce_height) * 1.5);
    appwell.translation_y = 0;

    const getTarget = (app_id) => {
      if (dock._dragging) return [null, null];
      let icons = dock._findIcons();
      let icon = icons.find((icon) => {
        return icon._appwell && icon._appwell._id == app_id;
      });
      if (!icon || !icon._appwell) {
        return [null, null];
      }
      return [icon._appwell.get_parent(), icon._appwell];
    };

    const translateDecor = (container, appwell) => {
      try {
        if (!container._icon) return;
        if (container._renderer) {
          container._renderer.translationY = appwell.translationY;
        }
        if (container._image) {
          container._image.translationY = appwell.translationY;
        }
        if (container._badge) {
          container._badge.translationY = appwell.translationY;
        }
        if (container._label) {
          container._label.opacity = 0;
        }
      } catch (err) {
        console.log(err);
      }
    };

    let t = 250;
    let _frames = [
      {
        _duration: t,
        _func: (f, s) => {
          let res = Linear.easeNone(f._time, 0, travel, f._duration);
          let [container, appwell] = getTarget(app_id);
          if (!appwell) return;
          try {
            appwell._bounce = true;
            if (dock.isVertical()) {
              appwell.translation_x =
                dock._position == DockPosition.LEFT ? res : -res;
              if (container._renderer) {
                container._renderer.translationX = appwell.translationX;
              }
            } else {
              appwell.translation_y =
                dock._position == DockPosition.BOTTOM ? -res : res;
              if (container._renderer) {
                container._renderer.translationY = appwell.translationY;
              }
            }
          } catch (err) {
            console.log(err);
          }
          translateDecor(container, appwell);
        },
      },
      {
        _duration: t * 3,
        _func: (f, s) => {
          let res = Bounce.easeOut(f._time, travel, -travel, f._duration);
          let [container, appwell] = getTarget(app_id);
          if (!appwell) return;
          try {
            appwell._bounce = true;
            if (dock.isVertical()) {
              appwell.translation_x = appwell.translation_x =
                dock._position == DockPosition.LEFT ? res : -res;
              if (container._renderer) {
                container._renderer.translationX = appwell.translationX;
              }
            } else {
              appwell.translation_y =
                dock._position == DockPosition.BOTTOM ? -res : res;
              if (container._renderer) {
                container._renderer.translationY = appwell.translationY;
              }
            }
          } catch (err) {
            console.log(err);
          }
          translateDecor(container, appwell);
        },
      },
    ];

    let frames = [];
    for (
      let i = 0;
      i < [3, 1, 2, 3][dock.extension.animation_bounce_frequency || 0];
      i++
    ) {
      _frames.forEach((b) => {
        frames.push({
          ...b,
        });
      });
    }

    dock.extension._hiTimer.runAnimation([
      ...frames,
      {
        _duration: 10,
        _func: (f, s) => {
          let [container, appwell] = getTarget(app_id);
          if (!appwell) return;
          try {
            appwell._bounce = true;
            appwell.translation_x = 0;
            appwell.translation_y = 0;
          } catch (err) {
            console.log(err);
          }
          translateDecor(container, appwell);
        },
      },
      {
        _duration: 10,
        _func: (f, s) => {
          let [container, appwell] = getTarget(app_id);
          if (!appwell) return;
          try {
            appwell._bounce = false;
          } catch (err) {
            console.log(err);
          }
        },
      },
    ]);
  }
};
