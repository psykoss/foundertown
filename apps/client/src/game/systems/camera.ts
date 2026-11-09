import type { Point, Size } from "@founder-town/shared";

const LARGE_SCREEN = { w: 1920, h: 1080 };

/** Returns an integer zoom: 2x, or 3x on large screens, per device pixel. */
export function chooseZoom(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): number {
  const isLarge = cssWidth >= LARGE_SCREEN.w && cssHeight >= LARGE_SCREEN.h;
  return (isLarge ? 3 : 2) * Math.max(1, Math.round(devicePixelRatio));
}

function centerOnAxis(target: number, visible: number, mapSize: number) {
  if (mapSize <= visible) return mapSize / 2;
  return Math.min(Math.max(target, visible / 2), mapSize - visible / 2);
}

/** Returns the whole-pixel camera scroll that follows `target` inside the map. */
export function cameraScroll(
  target: Point,
  view: Size,
  zoom: number,
  map: Size,
): Point {
  return {
    x: Math.round(centerOnAxis(target.x, view.w / zoom, map.w) - view.w / 2),
    y: Math.round(centerOnAxis(target.y, view.h / zoom, map.h) - view.h / 2),
  };
}

/** Converts a world position to canvas pixels. */
export function worldToScreen(
  world: Point,
  scroll: Point,
  view: Size,
  zoom: number,
): Point {
  return {
    x: (world.x - scroll.x - view.w / 2) * zoom + view.w / 2,
    y: (world.y - scroll.y - view.h / 2) * zoom + view.h / 2,
  };
}
