import { FRAME_KEYS, frameKey } from "@founder-town/shared";
import type {
  AnimationFrame,
  AvatarConfig,
  CharacterLayer,
  Direction,
  FrameKey,
} from "@founder-town/shared";
import { CHARACTER_PART_SOURCES } from "../../src/index";
import type { CharacterPart, CharacterPartSource, Grid } from "../../src/index";

type Cells = string[][];
interface Columns {
  from: number;
  to: number;
}

const LAST_UPPER_ROW = 39;
const FIRST_LEG_ROW = 40;
const LAST_ROW = 45;
const FRONT_LEFT_LEG: Columns = { from: 9, to: 14 };
const FRONT_RIGHT_LEG: Columns = { from: 17, to: 22 };
const SIDE_LEG: Columns = { from: 14, to: 19 };
const SIDE_STRIDE = 3;
const SHADE_PAIRS = ["sS", "hH", "tT", "bB", "eE", "aA"];

function get(cells: Cells, x: number, y: number): string {
  return cells[y]?.[x] ?? ".";
}

function set(cells: Cells, x: number, y: number, value: string): void {
  const row = cells[y];
  if (row && x >= 0 && x < row.length) row[x] = value;
}

/** Raises a foot by 2 rows, shortening the leg above it. */
function liftLeg(cells: Cells, columns: Columns): void {
  for (let x = columns.from; x <= columns.to; x++) {
    set(cells, x, LAST_ROW - 3, get(cells, x, LAST_ROW - 1));
    set(cells, x, LAST_ROW - 2, get(cells, x, LAST_ROW));
    set(cells, x, LAST_ROW - 1, ".");
    set(cells, x, LAST_ROW, ".");
  }
}

/** Raises the upper body by 1 row. The legs stretch to fill the gap. */
function bob(cells: Cells): Cells {
  const result = cells.map((row) => [...row]);
  for (let y = 0; y < LAST_UPPER_ROW; y++) {
    result[y] = [...(cells[y + 1] ?? [])];
  }
  result[LAST_UPPER_ROW] = [...(cells[FIRST_LEG_ROW] ?? [])];
  return result;
}

/** Splits the single side-view leg block into a rear and a front leg. */
function sideStride(cells: Cells, liftFront: boolean): void {
  const original = cells.map((row) => [...row]);
  const rear = {
    from: SIDE_LEG.from - SIDE_STRIDE,
    to: SIDE_LEG.to - SIDE_STRIDE,
  };
  const front = {
    from: SIDE_LEG.from + SIDE_STRIDE,
    to: SIDE_LEG.to + SIDE_STRIDE,
  };
  for (let y = FIRST_LEG_ROW; y <= LAST_ROW; y++) {
    for (let x = SIDE_LEG.from; x <= SIDE_LEG.to; x++) set(cells, x, y, ".");
    for (let x = SIDE_LEG.from; x <= SIDE_LEG.to; x++) {
      const value = get(original, x, y);
      if (value === ".") continue;
      set(cells, x - SIDE_STRIDE, y, value);
      set(cells, x + SIDE_STRIDE, y, value);
    }
  }
  liftLeg(cells, liftFront ? front : rear);
}

function mirrorKeepingShade(cells: Cells): Cells {
  return cells.map((row) => {
    const mirrored = [...row].reverse();
    let start = 0;
    while (start < mirrored.length) {
      const pair = SHADE_PAIRS.find((p) => p.includes(mirrored[start] ?? "."));
      if (!pair) {
        start += 1;
        continue;
      }
      let end = start;
      while (
        end + 1 < mirrored.length &&
        pair.includes(mirrored[end + 1] ?? ".")
      ) {
        end += 1;
      }
      mirrored.splice(
        start,
        end - start + 1,
        ...mirrored.slice(start, end + 1).reverse(),
      );
      start = end + 1;
    }
    return mirrored;
  });
}

function viewFor(part: CharacterPartSource, direction: Direction): Grid {
  if (direction === "down") return part.front;
  if (direction === "up") return part.back;
  return part.side;
}

function deriveFrame(
  part: CharacterPartSource,
  direction: Direction,
  frame: AnimationFrame,
): Grid {
  let cells: Cells = viewFor(part, direction).map((row) => [...row]);
  const isSide = direction === "left" || direction === "right";
  if (frame === 0 || frame === 2) {
    if (isSide) {
      sideStride(cells, frame === 0);
    } else {
      liftLeg(cells, frame === 0 ? FRONT_RIGHT_LEG : FRONT_LEFT_LEG);
    }
  }
  if (frame === 1 || frame === 3) cells = bob(cells);
  if (direction === "left") cells = mirrorKeepingShade(cells);
  return cells.map((row) => row.join(""));
}

function derivePart(source: CharacterPartSource): CharacterPart {
  const frames = Object.fromEntries(
    FRAME_KEYS.map((key) => {
      const [direction, frame] = key.split("_") as [Direction, string];
      const parsed = (
        frame === "idle" ? "idle" : Number(frame)
      ) as AnimationFrame;
      return [
        frameKey(direction, parsed),
        deriveFrame(source, direction, parsed),
      ];
    }),
  ) as Record<FrameKey, Grid>;
  return {
    id: source.id,
    layer: source.layer,
    anchor: source.anchor,
    frames,
  };
}

export const CHARACTER_PARTS: readonly CharacterPart[] =
  CHARACTER_PART_SOURCES.map(derivePart);

/** Returns the parts named by an avatar config. */
export function partsForAvatar(config: AvatarConfig): readonly CharacterPart[] {
  const wanted: Record<CharacterLayer, string | null> = {
    body: config.body,
    hairBack: config.hair,
    hairFront: config.hair,
    bottom: config.bottom,
    shoes: config.shoes,
    top: config.top,
    accessory: config.accessory,
  };
  return CHARACTER_PARTS.filter((part) => wanted[part.layer] === part.id);
}
