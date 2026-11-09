import { CHARACTER_PARTS, partsForAvatar } from "../lib/derive";
import {
  ANIMATION_FRAMES,
  DEFAULT_AVATAR,
  DIRECTIONS,
  WALK_FRAMES,
  frameKey,
} from "@founder-town/shared";
import type { Direction } from "@founder-town/shared";
import {
  DEFAULT_RAMPS,
  PALETTE,
  PROPS,
  RAMPS,
  SLOTS,
  TILES,
} from "../../src/index";
import type { CharacterPart, RampName, RampSelection } from "../../src/index";
import { renderProp } from "../lib/atlases";
import {
  composeAvatar,
  fixedColors,
  rampColors,
  rasterize,
} from "../lib/compile";
import type { Raster } from "../lib/raster";

const REF_1 = new URL(
  "../../../../docs/references/native/ref-1.png",
  import.meta.url,
).href;
const REF_3 = new URL(
  "../../../../docs/references/native/ref-3.png",
  import.meta.url,
).href;
const WALK_SCALE = 4;
const WALK_FRAME_MS = 160;

const appElement = document.getElementById("app");
if (!appElement) throw new Error("Missing #app element");
const app: HTMLElement = appElement;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function draw(canvas: HTMLCanvasElement, raster: Raster, scale: number) {
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.style.width = `${raster.width * scale}px`;
  canvas.style.height = `${raster.height * scale}px`;
  canvas
    .getContext("2d")
    ?.putImageData(
      new ImageData(raster.data, raster.width, raster.height),
      0,
      0,
    );
}

function canvasFor(raster: Raster, scale: number): HTMLCanvasElement {
  const canvas = element("canvas");
  draw(canvas, raster, scale);
  return canvas;
}

function spriteCell(label: string, raster: Raster): HTMLElement {
  const cell = element("div", "cell");
  const pair = element("div", "pair");
  pair.append(canvasFor(raster, 1), canvasFor(raster, 4));
  cell.append(pair, element("span", "", label));
  return cell;
}

function section(title: string): HTMLElement {
  const container = element("section");
  container.append(element("h2", "", title));
  app.append(container);
  return container;
}

function swatch(label: string, hex: string): HTMLElement {
  const cell = element("div", "cell swatch");
  const chip = element("div", "chip");
  chip.style.background = hex;
  cell.append(chip, element("span", "", label), element("span", "", hex));
  return cell;
}

function renderPalette() {
  const container = section("Palette");
  const fixed = element("div", "row");
  for (const [char, hex] of Object.entries(PALETTE)) {
    fixed.append(swatch(char, hex));
  }
  container.append(fixed, element("h3", "", "Slot key colours"));
  const keys = element("div", "row");
  for (const [char, slot] of Object.entries(SLOTS)) {
    keys.append(swatch(char, slot.key));
  }
  container.append(keys);
  container.append(rampGroups());
}

const RAMP_GROUPS: readonly (readonly [string, RampName])[] = [
  ["Skin", "skin"],
  ["Hair", "hair"],
  ["Clothes", "top"],
];

function rampGroups(): DocumentFragment {
  const container = document.createDocumentFragment();
  for (const [label, rampName] of RAMP_GROUPS) {
    const ramps = RAMPS[rampName];
    container.append(element("h3", "", `${label} ramps`));
    const row = element("div", "row");
    for (const [name, ramp] of Object.entries(ramps)) {
      row.append(
        swatch(`${name} light`, ramp.light),
        swatch(`${name} dark`, ramp.dark),
      );
    }
    container.append(row);
  }
  return container;
}

function nearestPalette(r: number, g: number, b: number): readonly number[] {
  let best: readonly number[] = PALETTE_RGB[0] ?? [0, 0, 0];
  let bestDistance = Infinity;
  for (const color of PALETTE_RGB) {
    const distance =
      ((color[0] ?? 0) - r) ** 2 +
      ((color[1] ?? 0) - g) ** 2 +
      ((color[2] ?? 0) - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

const PALETTE_RGB = Object.values(PALETTE).map((hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
});

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** Shows a reference next to the same image reduced to the 32-colour palette. */
async function comparisonRow(url: string, label: string, scale: number) {
  const image = await loadImage(url);
  const original = element("canvas");
  original.width = image.width;
  original.height = image.height;
  original.style.width = `${image.width * scale}px`;
  const context = original.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D context");
  context.drawImage(image, 0, 0);

  const source = context.getImageData(0, 0, image.width, image.height);
  const reduced = new Uint8ClampedArray(source.data);
  for (let offset = 0; offset < reduced.length; offset += 4) {
    const [r, g, b] = nearestPalette(
      reduced[offset] ?? 0,
      reduced[offset + 1] ?? 0,
      reduced[offset + 2] ?? 0,
    );
    reduced[offset] = r ?? 0;
    reduced[offset + 1] = g ?? 0;
    reduced[offset + 2] = b ?? 0;
  }
  const mapped = canvasFor(
    { width: image.width, height: image.height, data: reduced },
    scale,
  );

  const row = element("div", "row");
  for (const [canvas, caption] of [
    [original, `${label}: reference, native pixels`],
    [mapped, `${label}: reduced to the 32-colour palette`],
  ] as const) {
    const cell = element("div", "cell");
    cell.append(canvas, element("span", "", caption));
    row.append(cell);
  }
  return row;
}

const refUrl = (name: string) =>
  new URL(`../../../../docs/references/native/${name}.png`, import.meta.url)
    .href;

const AVATAR_REFERENCES: readonly {
  url: string;
  label: string;
  direction: Direction;
  x: number;
  y: number;
  w: number;
  h: number;
}[] = [
  {
    url: refUrl("ref-8-front"),
    label: "front",
    direction: "down",
    x: 34,
    y: 15,
    w: 32,
    h: 48,
  },
  {
    url: refUrl("ref-9-side-a"),
    label: "right",
    direction: "right",
    x: 28,
    y: 20,
    w: 32,
    h: 48,
  },
  {
    url: refUrl("ref-10-back"),
    label: "back",
    direction: "up",
    x: 28,
    y: 20,
    w: 32,
    h: 48,
  },
  {
    url: refUrl("ref-11-side-b"),
    label: "left",
    direction: "left",
    x: 27,
    y: 20,
    w: 32,
    h: 48,
  },
];

function cropCanvas(
  image: HTMLImageElement,
  box: (typeof AVATAR_REFERENCES)[number],
  scale: number,
) {
  const canvas = element("canvas");
  canvas.width = box.w;
  canvas.height = box.h;
  canvas.style.width = `${box.w * scale}px`;
  canvas
    .getContext("2d")
    ?.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvas;
}

async function renderAvatarComparison() {
  const container = section("Structure against references");
  container.id = "avatar-compare";
  const row = element("div", "row");
  for (const reference of AVATAR_REFERENCES) {
    const image = await loadImage(reference.url);
    const composed = composeAvatar(
      defaultParts(),
      DEFAULT_RAMPS,
      reference.direction,
      "idle",
    );
    const cell = element("div", "cell");
    const pair = element("div", "pair");
    pair.append(canvasFor(composed, 4), cropCanvas(image, reference, 4));
    cell.append(
      pair,
      element("span", "", `${reference.label}: ours, reference`),
    );
    row.append(cell);
  }
  container.append(row);
}

async function renderComparison() {
  const container = section("Palette against references");
  container.id = "comparison";
  container.append(
    await comparisonRow(REF_1, "Office", 1),
    await comparisonRow(REF_3, "Avatars", 2),
  );
  const swatches = element("div", "row");
  for (const [char, hex] of Object.entries(PALETTE)) {
    swatches.append(swatch(char, hex));
  }
  container.append(swatches, rampGroups());
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

function partGroup(part: CharacterPart): string {
  return part.layer.startsWith("hair") ? "hair" : part.layer;
}

function defaultParts(): readonly CharacterPart[] {
  return partsForAvatar(DEFAULT_AVATAR);
}

/** Small seeded generator, so the exported sheet is the same every run. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AVATAR_COUNT = 12;
const SHEET_SCALE = 2;
const OPTIONAL_GROUPS = new Set(["accessory"]);

function rollAvatar(random: () => number) {
  const choose = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error("Cannot pick from an empty list");
    return item;
  };
  const groups = [...new Set(CHARACTER_PARTS.map(partGroup))];
  const chosen = new Map(
    groups.map((group) => {
      const ids = [
        ...new Set(
          CHARACTER_PARTS.filter((part) => partGroup(part) === group).map(
            (part) => part.id,
          ),
        ),
      ];
      const none = OPTIONAL_GROUPS.has(group) && random() < 0.5;
      return [group, none ? null : choose(ids)] as const;
    }),
  );
  const parts = CHARACTER_PARTS.filter(
    (part) => chosen.get(partGroup(part)) === part.id,
  );
  const ramps = Object.fromEntries(
    (Object.keys(RAMPS) as RampName[]).map((name) => [
      name,
      choose(Object.keys(RAMPS[name])),
    ]),
  ) as RampSelection;
  return { parts, ramps };
}

function renderAvatarGrid() {
  const container = section("12 random avatars walking");
  container.id = "avatar-grid";
  const random = seededRandom(20261109);
  const animated: {
    canvas: HTMLCanvasElement;
    parts: readonly CharacterPart[];
    ramps: RampSelection;
    direction: Direction;
  }[] = [];
  for (let index = 0; index < AVATAR_COUNT; index++) {
    const { parts, ramps } = rollAvatar(random);
    const row = element("div", "row tight");
    for (const direction of DIRECTIONS) {
      const canvas = element("canvas");
      animated.push({ canvas, parts, ramps, direction });
      row.append(canvas);
    }
    row.append(element("span", "", "|"));
    for (const direction of DIRECTIONS) {
      for (const frame of WALK_FRAMES) {
        row.append(
          canvasFor(composeAvatar(parts, ramps, direction, frame), SHEET_SCALE),
        );
      }
    }
    container.append(row);
  }
  let step = 0;
  const drawAll = () => {
    const frame = WALK_FRAMES[step % WALK_FRAMES.length] ?? 0;
    for (const { canvas, parts, ramps, direction } of animated) {
      draw(canvas, composeAvatar(parts, ramps, direction, frame), SHEET_SCALE);
    }
    step += 1;
  };
  drawAll();
  setInterval(drawAll, WALK_FRAME_MS);
}

/** Picks one style per group, so back and front hair stay a matching pair. */
function randomParts(): readonly CharacterPart[] {
  const groups = [...new Set(CHARACTER_PARTS.map(partGroup))];
  const chosen = new Map(
    groups.map((group) => [
      group,
      pick(
        CHARACTER_PARTS.filter((part) => partGroup(part) === group).map(
          (part) => part.id,
        ),
      ),
    ]),
  );
  return CHARACTER_PARTS.filter(
    (part) => chosen.get(partGroup(part)) === part.id,
  );
}

function randomRamps(): RampSelection {
  const entries = (Object.keys(RAMPS) as RampName[]).map((name) => [
    name,
    pick(Object.keys(RAMPS[name])),
  ]);
  return Object.fromEntries(entries) as RampSelection;
}

function renderWalkRow() {
  const container = section("Walk");
  const button = element("button", "", "Random avatar");
  const row = element("div", "row");
  container.append(button, row);

  const canvases = new Map<Direction, HTMLCanvasElement>(
    DIRECTIONS.map((direction) => {
      const cell = element("div", "cell");
      const canvas = element("canvas");
      cell.append(canvas, element("span", "", direction));
      row.append(cell);
      return [direction, canvas];
    }),
  );

  let parts = defaultParts();
  let ramps: RampSelection = DEFAULT_RAMPS;
  let step = 0;

  function drawStep() {
    const frame = WALK_FRAMES[step % WALK_FRAMES.length] ?? 0;
    for (const [direction, canvas] of canvases) {
      draw(canvas, composeAvatar(parts, ramps, direction, frame), WALK_SCALE);
    }
  }

  button.addEventListener("click", () => {
    parts = randomParts();
    ramps = randomRamps();
    drawStep();
  });

  drawStep();
  setInterval(() => {
    step += 1;
    drawStep();
  }, WALK_FRAME_MS);
}

function renderCharacterParts() {
  const container = section("Character parts");
  const colorize = rampColors(DEFAULT_RAMPS);
  for (const part of CHARACTER_PARTS) {
    container.append(element("h3", "", `${part.layer}/${part.id}`));
    for (const direction of DIRECTIONS) {
      const row = element("div", "row");
      for (const frame of ANIMATION_FRAMES) {
        const key = frameKey(direction, frame);
        row.append(spriteCell(key, rasterize(part.frames[key], colorize)));
      }
      container.append(row);
    }
  }
}

function renderTilesAndProps() {
  const tiles = element("div", "row");
  for (const tile of TILES) {
    tiles.append(spriteCell(tile.id, rasterize(tile.grid, fixedColors)));
  }
  section("Tiles").append(tiles);

  const props = element("div", "row");
  for (const prop of PROPS) {
    props.append(spriteCell(prop.id, renderProp(prop)));
  }
  section("Props").append(props);
}

renderAvatarGrid();
await renderAvatarComparison();
await renderComparison();
renderWalkRow();
renderPalette();
renderTilesAndProps();
renderCharacterParts();
document.body.dataset["ready"] = "true";
