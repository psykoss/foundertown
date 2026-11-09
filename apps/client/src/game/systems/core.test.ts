import { describe, expect, it } from "vitest";
import office from "../../../public/maps/office.tmj?raw";
import { cameraScroll, chooseZoom, worldToScreen } from "./camera";
import { isBlocked, parseMap } from "./map";
import { DirectionInput, FEET_BOX, moveWithCollision } from "./movement";

const map = parseMap(JSON.parse(office));

function walk(
  start: { x: number; y: number },
  direction: "up" | "down" | "left" | "right",
) {
  let position = start;
  for (let i = 0; i < 400; i++) {
    position = moveWithCollision(map, position, direction, 2);
  }
  return position;
}

describe("office map", () => {
  it("is 20x15 and has the expected content", () => {
    expect([map.width, map.height]).toEqual([20, 15]);
    expect(map.props.map((prop) => prop.id)).toEqual(["desk"]);
  });

  it("spawns on a free tile", () => {
    expect(
      isBlocked(
        map,
        Math.floor(map.spawn.x / map.tileSize),
        Math.floor(map.spawn.y / map.tileSize),
      ),
    ).toBe(false);
  });

  it("blocks both desk tiles and every wall tile", () => {
    const desk = map.props[0]!;
    const tileX = desk.x / map.tileSize;
    const tileY = desk.y / map.tileSize;
    expect(isBlocked(map, tileX, tileY)).toBe(true);
    expect(isBlocked(map, tileX + 1, tileY)).toBe(true);
    map.walls.forEach((frame, index) => {
      if (frame) expect(map.blocked[index]).toBe(true);
    });
  });
});

describe("moveWithCollision", () => {
  const open = { x: 168, y: 336 };

  it("stops flush against each wall", () => {
    expect(walk(open, "right").x).toBe(19 * 32 - FEET_BOX.halfWidth);
    expect(walk(open, "left").x).toBe(32 + FEET_BOX.halfWidth);
    expect(walk(open, "up").y).toBe(2 * 32 + FEET_BOX.height);
    expect(walk(open, "down").y).toBe(14 * 32);
  });

  it("stops at the desk from the front and from behind", () => {
    const deskX = 320;
    expect(walk({ x: deskX, y: 336 }, "up").y).toBe(8 * 32 + FEET_BOX.height);
    expect(walk({ x: deskX, y: 120 }, "down").y).toBe(7 * 32);
  });

  it("allows free positions that are not tile-aligned", () => {
    expect(moveWithCollision(map, open, "right", 3)).toEqual({
      x: 171,
      y: 336,
    });
  });
});

describe("DirectionInput", () => {
  it("uses the most recent key and falls back on release", () => {
    const input = new DirectionInput();
    input.press("left");
    input.press("up");
    expect(input.current).toBe("up");
    input.release("up");
    expect(input.current).toBe("left");
    input.clear();
    expect(input.current).toBeNull();
  });
});

describe("camera", () => {
  const mapSize = { w: 640, h: 480 };

  it("chooses integer zoom by screen size and density", () => {
    expect(chooseZoom(1280, 720, 1)).toBe(2);
    expect(chooseZoom(1920, 1080, 1)).toBe(3);
    expect(chooseZoom(1280, 720, 2)).toBe(4);
    expect(chooseZoom(1280, 720, 1.5)).toBe(4);
  });

  it("clamps to the map edges", () => {
    const view = { w: 800, h: 600 };
    const zoom = 2;
    const topLeft = cameraScroll({ x: 0, y: 0 }, view, zoom, mapSize);
    expect(worldToScreen({ x: 0, y: 0 }, topLeft, view, zoom)).toEqual({
      x: 0,
      y: 0,
    });
    const bottomRight = cameraScroll({ x: 640, y: 480 }, view, zoom, mapSize);
    expect(worldToScreen({ x: 640, y: 480 }, bottomRight, view, zoom)).toEqual({
      x: 800,
      y: 600,
    });
  });

  it("centres a map smaller than the view", () => {
    const view = { w: 2000, h: 1200 };
    const scroll = cameraScroll({ x: 10, y: 10 }, view, 2, mapSize);
    expect(worldToScreen({ x: 320, y: 240 }, scroll, view, 2)).toEqual({
      x: 1000,
      y: 600,
    });
  });
});
