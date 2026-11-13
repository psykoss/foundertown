/**
 * Camera: smooth follow, clamped to the map. Starts at the largest integer zoom that fits the viewport;
 * trackpad pinch / two-finger scroll (or mouse wheel) zooms smoothly from there.
 *
 * Zoom is continuous. At whole zoom levels the view is snapped to a screen pixel so the art is crisp;
 * in between nothing is snapped (snapping there makes the world jitter while zooming). Tile seams at
 * fractional zoom are prevented by the extruded tileset (see `extrudedTileset` in world/WorldView.ts).
 * This file positions the camera itself (no Phaser follow / bounds / roundPixels).
 *
 * Free mode (the studio): the camera stops following and is dragged instead, it can zoom out until
 * the whole map is in view, and the wheel zooms around the pointer.
 */
import Phaser from "phaser";
import { MIN_VISIBLE_WORLD_H } from "@ft/shared";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
/** Free mode may zoom out past 1× to show a whole map (pixels are dropped there — an overview, not a play view). */
const FREE_MIN_ZOOM = 0.5;
/** Zoom change per wheel-delta unit (exponential, so it feels the same at every level). */
const SCROLL_RATE = 0.0025;
/** Pinch arrives as ctrl+wheel with much smaller deltas than a scroll. */
const PINCH_RATE = 0.01;
/** Time constant of the ease toward the target zoom. */
const EASE_MS = 70;
/** Time constant of the follow (≈ a 0.18 lerp per 60 fps frame). */
const FOLLOW_MS = 85;

export function integerZoom(viewH: number): number {
  return Math.max(1, Math.floor(viewH / MIN_VISIBLE_WORLD_H));
}

export interface CameraControls {
  /** Ease to the next whole zoom level in `dir` (crisp pixels) — used by the +/− buttons. */
  zoomStep(dir: 1 | -1): void;
  /** The map was swapped for one of another size: show it from the target at once. */
  setWorld(worldW: number, worldH: number): void;
  /** Free mode on: stop following, start from a view of the whole map. Off: back to the target at the automatic zoom. */
  setFree(on: boolean): void;
  /** Free mode: drag the view by a distance in screen px. */
  panBy(dx: number, dy: number): void;
}

/**
 * Screen position of a world point, exactly as the camera matrix draws it (zoom about the view center).
 * DOM overlays (name tags) use this so they stay glued to their sprite.
 */
export function worldToScreen(cam: Phaser.Cameras.Scene2D.Camera, wx: number, wy: number): { x: number; y: number } {
  const ox = cam.width * cam.originX;
  const oy = cam.height * cam.originY;
  return {
    x: (wx - cam.scrollX - ox) * cam.zoom + Math.floor(ox + 0.5),
    y: (wy - cam.scrollY - oy) * cam.zoom + Math.floor(oy + 0.5),
  };
}

export function setupCamera(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite, worldW: number, worldH: number, onZoom: (z: number) => void): CameraControls {
  const cam = scene.cameras.main;
  cam.setRoundPixels(false); // would floor the scroll to whole WORLD pixels, which stutters at fractional zoom
  cam.setBackgroundColor("#30325b");

  /** Zoom picked by the user; null = automatic (fit the viewport). */
  let userZoom: number | null = null;
  /** Eased zoom, and the view's top-left in world px before snapping. */
  let zoomF = 0;
  let leftF = NaN;
  let topF = NaN;
  let reported = 0;
  /** Free mode: the world point at the center of the view, and the point the wheel is zooming around. */
  let free = false;
  const focus = { x: 0, y: 0 };
  let anchor: { wx: number; wy: number; sx: number; sy: number } | null = null;
  /** Free mode opens on the whole map; the frame is still sliding to its new width then, so the fit is redone for this long (ms). */
  let fitting = 0;
  const fitMap = () => {
    // the largest zoom that shows all of the map (a whole number when that is 1× or more)
    const fit = Math.min(cam.width / worldW, cam.height / worldH);
    userZoom = Phaser.Math.Clamp(fit >= 1 ? Math.floor(fit) : fit, FREE_MIN_ZOOM, MAX_ZOOM);
    focus.x = worldW / 2;
    focus.y = worldH / 2;
  };

  const minZoom = () => (free ? FREE_MIN_ZOOM : MIN_ZOOM);
  const wanted = () => Phaser.Math.Clamp(userZoom ?? integerZoom(scene.scale.height), minZoom(), MAX_ZOOM);

  /** One axis: follow the focus, keep the view inside the map (or center a smaller map). Returns the view's start in world px. */
  const place = (current: number, focus: number, view: number, world: number, z: number, k: number) => {
    const span = view / z; // world px visible
    const goal = focus - span / 2;
    const v = Number.isNaN(current) ? goal : current + (goal - current) * k;
    return world <= span ? (world - span) / 2 : Phaser.Math.Clamp(v, 0, world - span);
  };

  const update = (_time: number, delta: number) => {
    if (fitting > 0) {
      fitting -= delta;
      fitMap();
    }
    // zoom: ease toward the target
    const goal = wanted();
    if (zoomF === 0) zoomF = goal;
    else if (zoomF !== goal) {
      zoomF += (goal - zoomF) * (1 - Math.exp(-delta / EASE_MS));
      if (Math.abs(goal - zoomF) < 0.001) zoomF = goal;
    }
    const z = zoomF;
    cam.setZoom(z);
    const shown = Math.round(z * 100) / 100;
    if (shown !== reported) onZoom((reported = shown));

    // position: follow smoothly; snap to a whole screen pixel only when the zoom is a whole number
    if (free && anchor) {
      // keep the world point under the pointer where it is while the zoom eases
      focus.x = anchor.wx - (anchor.sx - cam.width / 2) / z;
      focus.y = anchor.wy - (anchor.sy - cam.height / 2) / z;
      if (zoomF === goal) anchor = null;
    }
    const k = free ? 1 : 1 - Math.exp(-delta / FOLLOW_MS);
    leftF = place(leftF, free ? focus.x : target.x, cam.width, worldW, z, k);
    topF = place(topF, free ? focus.y : target.y, cam.height, worldH, z, k);
    if (free) {
      // the view was kept inside the map: the focus is wherever that left it
      focus.x = leftF + cam.width / z / 2;
      focus.y = topF + cam.height / z / 2;
    }
    const snap = Number.isInteger(z);
    const left = snap ? Math.round(leftF * z) / z : leftF;
    const top = snap ? Math.round(topF * z) / z : topF;
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    // inverse of worldToScreen: the scroll that puts world (left, top) at screen (0, 0)
    cam.setScroll(left - ox + Math.floor(ox + 0.5) / z, top - oy + Math.floor(oy + 0.5) / z);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault(); // also stops the browser's own pinch-zoom of the page
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
    fitting = 0;
    userZoom = Phaser.Math.Clamp(wanted() * Math.exp(-delta * (e.ctrlKey ? PINCH_RATE : SCROLL_RATE)), minZoom(), MAX_ZOOM);
    if (free && zoomF > 0) anchor = { wx: leftF + e.offsetX / zoomF, wy: topF + e.offsetY / zoomF, sx: e.offsetX, sy: e.offsetY };
  };
  const canvas = scene.game.canvas;
  canvas.addEventListener("wheel", onWheel, { passive: false });

  update(0, 0);
  // POST_UPDATE: after the scene has moved the characters, before the frame is drawn
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    canvas.removeEventListener("wheel", onWheel);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, update);
  });

  return {
    zoomStep(dir) {
      const z = wanted();
      userZoom = Phaser.Math.Clamp(dir > 0 ? Math.floor(z + 1e-6) + 1 : Math.ceil(z - 1e-6) - 1, MIN_ZOOM, MAX_ZOOM);
      anchor = null;
      fitting = 0;
    },
    setWorld(w, h) {
      worldW = w;
      worldH = h;
      leftF = topF = NaN;
    },
    setFree(on) {
      free = on;
      anchor = null;
      fitting = on ? 400 : 0;
      if (on) fitMap();
      else userZoom = null;
    },
    panBy(dx, dy) {
      if (!free || zoomF <= 0) return;
      anchor = null;
      fitting = 0;
      focus.x -= dx / zoomF;
      focus.y -= dy / zoomF;
    },
  };
}
