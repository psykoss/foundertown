import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Areas of each screenshot that hold only pixel art: no video, text or UI. */
const ART_REGIONS: Readonly<Record<string, readonly Box[]>> = {
  "Screenshot 2026-11-09 at 07.17.47.png": [
    { x: 150, y: 350, w: 660, h: 320 },
    { x: 720, y: 880, w: 150, h: 170 },
  ],
  "Screenshot 2026-11-09 at 14.21.03.png": [{ x: 30, y: 200, w: 650, h: 200 }],
  "Screenshot 2026-11-09 at 14.21.25.png": [
    { x: 50, y: 110, w: 280, h: 175 },
    { x: 470, y: 345, w: 240, h: 140 },
  ],
  "Screenshot 2026-11-09 at 14.21.46.png": [{ x: 0, y: 100, w: 202, h: 130 }],
  "Screenshot 2026-11-09 at 14.26.26.png": [{ x: 160, y: 90, w: 1110, h: 480 }],
  "Screenshot 2026-11-09 at 14.31.16.png": [{ x: 0, y: 0, w: 136, h: 144 }],
  "Screenshot 2026-11-09 at 17.37.05.png": [{ x: 296, y: 158, w: 180, h: 330 }],
  "Screenshot 2026-11-09 at 17.37.11.png": [{ x: 250, y: 192, w: 205, h: 325 }],
  "Screenshot 2026-11-09 at 17.37.17.png": [{ x: 260, y: 192, w: 180, h: 280 }],
  "Screenshot 2026-11-09 at 17.37.22.png": [{ x: 245, y: 192, w: 205, h: 325 }],
};

/** Screenshots whose native grid cannot be recovered, with the reason. */
const UNRESOLVABLE: Readonly<Record<string, string>> = {
  "Screenshot 2026-11-09 at 14.21.03.png":
    "Zoomed out: native pixels are about 1.4 screen pixels, too small to resample.",
};

const EDGE_THRESHOLD = 30;
const MIN_SCALE = 2;
const MAX_SCALE = 6;
const SCALE_STEP = 0.005;

const toolsDir = dirname(fileURLToPath(import.meta.url));
const referencesDir = resolve(toolsDir, "../../../docs/references");
const nativeDir = join(referencesDir, "native");

function edgeProfile(image: PNG, boxes: readonly Box[], vertical: boolean) {
  const { width, height, data } = image;
  const profile = new Float64Array(vertical ? height : width);
  for (const box of boxes) {
    for (let y = box.y; y < Math.min(box.y + box.h, height - 1); y++) {
      for (let x = box.x; x < Math.min(box.x + box.w, width - 1); x++) {
        const a = (y * width + x) * 4;
        const b = vertical ? a + width * 4 : a + 4;
        const difference =
          Math.abs((data[a] ?? 0) - (data[b] ?? 0)) +
          Math.abs((data[a + 1] ?? 0) - (data[b + 1] ?? 0)) +
          Math.abs((data[a + 2] ?? 0) - (data[b + 2] ?? 0));
        if (difference > EDGE_THRESHOLD) {
          const index = vertical ? y + 1 : x + 1;
          profile[index] = (profile[index] ?? 0) + 1;
        }
      }
    }
  }
  return profile;
}

/** Measures how strongly edges line up with a grid of the given period. */
function combFit(profile: Float64Array, period: number) {
  let real = 0;
  let imaginary = 0;
  let total = 0;
  profile.forEach((weight, index) => {
    const angle = (2 * Math.PI * index) / period;
    real += weight * Math.cos(angle);
    imaginary += weight * Math.sin(angle);
    total += weight;
  });
  const phase =
    ((((Math.atan2(imaginary, real) / (2 * Math.PI)) * period) % period) +
      period) %
    period;
  return { score: total ? Math.hypot(real, imaginary) / total : 0, phase };
}

export interface ScaleResult {
  scale: number;
  score: number;
  phaseX: number;
  phaseY: number;
}

/** Finds the on-screen size of one native pixel, shared by both axes. */
function detectScale(
  image: PNG,
  boxes: readonly Box[],
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
): ScaleResult {
  const columns = edgeProfile(image, boxes, false);
  const rows = edgeProfile(image, boxes, true);
  let best: ScaleResult = { scale: 0, score: -1, phaseX: 0, phaseY: 0 };
  for (let scale = minScale; scale <= maxScale; scale += SCALE_STEP) {
    const x = combFit(columns, scale);
    const y = combFit(rows, scale);
    const score = x.score + y.score;
    if (score > best.score) {
      best = { scale, score, phaseX: x.phase, phaseY: y.phase };
    }
  }
  return best;
}

/** Samples the centre of each native pixel, with no blending. */
function downscale(image: PNG, { scale, phaseX, phaseY }: ScaleResult): PNG {
  const originX = phaseX - scale;
  const originY = phaseY - scale;
  const width = Math.floor((image.width - originX) / scale);
  const height = Math.floor((image.height - originY) / scale);
  const native = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(
        image.width - 1,
        Math.max(0, Math.floor(originX + (x + 0.5) * scale)),
      );
      const sourceY = Math.min(
        image.height - 1,
        Math.max(0, Math.floor(originY + (y + 0.5) * scale)),
      );
      const from = (sourceY * image.width + sourceX) * 4;
      native.data.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return native;
}

interface Loaded {
  name: string;
  image: PNG;
  result: ScaleResult;
  native: PNG;
}

/** Fixed ids, so adding or removing a screenshot never renumbers the others. */
const REFERENCES: readonly {
  id: string;
  file: string;
  colourOnly?: boolean;
  /** Searches from here up, so that a large block is not read as its halves. */
  minScale?: number;
  maxScale?: number;
}[] = [
  { id: "ref-1", file: "Screenshot 2026-11-09 at 07.17.47.png" },
  { id: "ref-2", file: "Screenshot 2026-11-09 at 14.21.03.png" },
  { id: "ref-3", file: "Screenshot 2026-11-09 at 14.21.25.png" },
  { id: "ref-4", file: "Screenshot 2026-11-09 at 14.21.46.png" },
  { id: "ref-5", file: "Screenshot 2026-11-09 at 14.26.26.png" },
  { id: "ref-6", file: "Screenshot 2026-11-09 at 14.31.16.png" },
  {
    id: "ref-8-front",
    file: "Screenshot 2026-11-09 at 17.37.05.png",
    minScale: 6,
    maxScale: 10,
  },
  {
    id: "ref-9-side-a",
    file: "Screenshot 2026-11-09 at 17.37.11.png",
    minScale: 6,
    maxScale: 10,
  },
  {
    id: "ref-10-back",
    file: "Screenshot 2026-11-09 at 17.37.17.png",
    minScale: 6,
    maxScale: 10,
  },
  {
    id: "ref-11-side-b",
    file: "Screenshot 2026-11-09 at 17.37.22.png",
    minScale: 6,
    maxScale: 10,
  },
  // About 1.9 screen pixels per native pixel: read for colours, never resampled.
  {
    id: "ref-7",
    file: "native/Screenshot 2026-11-09 at 17.16.29.png",
    colourOnly: true,
  },
];

const IDENTITY: ScaleResult = { scale: 1, score: 0, phaseX: 1, phaseY: 1 };

function loadReferences(): Loaded[] {
  const loaded: Loaded[] = [];
  for (const { id: name, file, colourOnly, minScale, maxScale } of REFERENCES) {
    const path = join(referencesDir, file);
    if (UNRESOLVABLE[file]) {
      console.log(`${name}: skipped. ${UNRESOLVABLE[file]}`);
      continue;
    }
    if (!existsSync(path)) {
      console.warn(`${name}: not found, skipped (${file})`);
      continue;
    }
    const image = PNG.sync.read(readFileSync(path));
    if (colourOnly) {
      loaded.push({ name, image, result: IDENTITY, native: image });
      console.log(`${name}: colours only`);
      continue;
    }
    const boxes = ART_REGIONS[file] ?? [
      { x: 0, y: 0, w: image.width, h: image.height },
    ];
    const result = detectScale(image, boxes, minScale, maxScale);
    const native = downscale(image, result);
    writeFileSync(join(nativeDir, `${name}.png`), PNG.sync.write(native));
    console.log(
      `${name}: scale ${result.scale.toFixed(3)}, fit ${result.score.toFixed(2)}, ${native.width}x${native.height}`,
    );
    loaded.push({ name, image, result, native });
  }
  return loaded;
}

type Rgb = readonly [number, number, number];

function rgbAt(image: PNG, x: number, y: number): Rgb {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset] ?? 0,
    image.data[offset + 1] ?? 0,
    image.data[offset + 2] ?? 0,
  ];
}

function distance(a: Rgb, b: Rgb): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function toNative({ result }: Loaded, box: Box): Box {
  const originX = result.phaseX - result.scale;
  const originY = result.phaseY - result.scale;
  return {
    x: Math.round((box.x - originX) / result.scale),
    y: Math.round((box.y - originY) / result.scale),
    w: Math.round(box.w / result.scale),
    h: Math.round(box.h / result.scale),
  };
}

function clampBox(native: PNG, box: Box): Box {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  return {
    x,
    y,
    w: Math.min(native.width - x, box.w),
    h: Math.min(native.height - y, box.h),
  };
}

/** Finds the period, in native pixels, at which a floor pattern repeats. */
function tilePeriod(native: PNG, box: Box): Record<number, number> {
  const scores: Record<number, number> = {};
  for (const period of [8, 16, 24, 32, 40, 48, 64, 96]) {
    if (period > box.w / 2) continue;
    let total = 0;
    let count = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w - period; x++) {
        total += distance(rgbAt(native, x, y), rgbAt(native, x + period, y));
        count++;
      }
    }
    scores[period] = Number((total / count).toFixed(2));
  }
  return scores;
}

/** Measures the art inside a crop, treating the border's main colour as floor. */
function boundingBox(native: PNG, box: Box): { w: number; h: number } {
  const border: Record<string, number> = {};
  for (let x = box.x; x < box.x + box.w; x++) {
    const key = hex(rgbAt(native, x, box.y));
    border[key] = (border[key] ?? 0) + 1;
  }
  const background = Object.entries(border).sort((a, b) => b[1] - a[1])[0]?.[0];
  const value = Number.parseInt((background ?? "#000000").slice(1), 16);
  const floor: Rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const pixel = rgbAt(native, x, y);
      // Only outline-dark or saturated pixels count, so floor seams are ignored.
      if (distance(pixel, floor) > 120) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Lists runs of similar colour along a native scan line. */
function scanRuns(
  native: PNG,
  axis: "x" | "y",
  fixed: number,
  from: number,
  to: number,
): string[] {
  const runs: { start: number; length: number; color: Rgb }[] = [];
  for (let position = from; position < to; position++) {
    const color =
      axis === "y"
        ? rgbAt(native, fixed, position)
        : rgbAt(native, position, fixed);
    const last = runs[runs.length - 1];
    if (last && distance(last.color, color) <= 24) {
      last.length += 1;
    } else {
      runs.push({ start: position, length: 1, color });
    }
  }
  return runs.map((run) => `${run.start}+${run.length} ${hex(run.color)}`);
}

const FLOORS = [
  {
    ref: "ref-1",
    label: "grey office floor",
    box: { x: 170, y: 490, w: 600, h: 180 },
  },
  { ref: "ref-1", label: "cream floor", box: { x: 60, y: 200, w: 620, h: 90 } },
  {
    ref: "ref-1",
    label: "violet carpet",
    box: { x: 160, y: 990, w: 620, h: 80 },
  },
];

const AVATARS = [
  {
    ref: "ref-3",
    label: "headphones, side view",
    box: { x: 470, y: 340, w: 90, h: 145 },
  },
  {
    ref: "ref-3",
    label: "blue cap, front view",
    box: { x: 605, y: 340, w: 105, h: 145 },
  },
];

const SCANS = [
  {
    ref: "ref-1",
    label: "wall, top to floor",
    axis: "y",
    fixed: 8,
    from: 10,
    to: 90,
  },
  {
    ref: "ref-3",
    label: "wall, top to floor",
    axis: "y",
    fixed: 8,
    from: 5,
    to: 75,
  },
  {
    ref: "ref-1",
    label: "desk, top to front",
    axis: "y",
    fixed: 75,
    from: 165,
    to: 225,
  },
  {
    ref: "ref-1",
    label: "desk, left to right",
    axis: "x",
    fixed: 195,
    from: 60,
    to: 180,
  },
  {
    ref: "ref-1",
    label: "name tag, top to bottom",
    axis: "y",
    fixed: 345,
    from: 355,
    to: 390,
  },
  {
    ref: "ref-1",
    label: "name tag, left to right",
    axis: "x",
    fixed: 370,
    from: 325,
    to: 385,
  },
  {
    ref: "ref-3",
    label: "floor under blue cap's feet",
    axis: "y",
    fixed: 168,
    from: 118,
    to: 140,
  },
  {
    ref: "ref-3",
    label: "blue cap centre, top to feet",
    axis: "y",
    fixed: 168,
    from: 84,
    to: 130,
  },
] as const;

mkdirSync(nativeDir, { recursive: true });
const references = loadReferences();
const byName = new Map(references.map((ref) => [ref.name, ref]));
function reference(name: string): Loaded {
  const found = byName.get(name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const measurements = {
  scales: Object.fromEntries(
    references
      .filter(({ result }) => result !== IDENTITY)
      .map(({ name, result, native }) => [
        name,
        {
          scale: Number(result.scale.toFixed(3)),
          fit: Number(result.score.toFixed(2)),
          width: native.width,
          height: native.height,
        },
      ]),
  ),
  skipped: UNRESOLVABLE,
  floorPeriods: FLOORS.map(({ ref, label, box }) => {
    const loaded = reference(ref);
    return {
      ref,
      label,
      differenceByPeriod: tilePeriod(
        loaded.native,
        clampBox(loaded.native, toNative(loaded, box)),
      ),
    };
  }),
  avatars: AVATARS.map(({ ref, label, box }) => {
    const loaded = reference(ref);
    return {
      ref,
      label,
      ...boundingBox(
        loaded.native,
        clampBox(loaded.native, toNative(loaded, box)),
      ),
    };
  }),
  scans: SCANS.map((scan) => ({
    ...scan,
    runs: scanRuns(
      reference(scan.ref).native,
      scan.axis,
      scan.fixed,
      scan.from,
      scan.to,
    ),
  })),
};

/** Screen regions that hold photos or UI text, never used for colours. */
const COLOUR_EXCLUDED: Readonly<Record<string, readonly Box[]>> = {
  "ref-1": [
    { x: 895, y: 740, w: 335, h: 125 },
    { x: 185, y: 675, w: 150, h: 50 },
    { x: 608, y: 675, w: 170, h: 50 },
    { x: 742, y: 805, w: 112, h: 55 },
    { x: 350, y: 298, w: 245, h: 52 },
    { x: 1085, y: 862, w: 60, h: 48 },
  ],
  "ref-3": [
    { x: 455, y: 182, w: 135, h: 150 },
    { x: 604, y: 182, w: 135, h: 150 },
  ],
  "ref-7": [
    { x: 0, y: 0, w: 2050, h: 24 },
    { x: 785, y: 570, w: 95, h: 90 },
    { x: 525, y: 1295, w: 645, h: 121 },
    { x: 1960, y: 1085, w: 90, h: 331 },
    { x: 1790, y: 672, w: 130, h: 55 },
    { x: 2040, y: 0, w: 10, h: 1416 },
  ],
};

type Lab = readonly [number, number, number];

function toLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Converts to OKLab, where distances match perceived colour differences. */
function oklab([red, green, blue]: Rgb): Lab {
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const l = Math.cbrt(0.4122 * r + 0.5363 * g + 0.0514 * b);
  const m = Math.cbrt(0.2119 * r + 0.6807 * g + 0.1074 * b);
  const s = Math.cbrt(0.0883 * r + 0.2817 * g + 0.63 * b);
  return [
    0.2104 * l + 0.7936 * m - 0.004 * s,
    1.9779 * l - 2.4286 * m + 0.4506 * s,
    0.0259 * l + 0.7828 * m - 0.8087 * s,
  ];
}

function labDistance(a: Lab, b: Lab): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function parseHex(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function histogram(
  loaded: Loaded,
  excluded: readonly Box[],
): Map<string, number> {
  const skip = excluded.map((box) => toNative(loaded, box));
  const counts = new Map<string, number>();
  for (let y = 0; y < loaded.native.height; y++) {
    for (let x = 0; x < loaded.native.width; x++) {
      if (
        skip.some((b) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h)
      )
        continue;
      const key = hex(rgbAt(loaded.native, x, y));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** K-means seeded by farthest points. Square-root weights keep small accents. */
function extractPalette(counts: Map<string, number>, size: number): string[] {
  const points = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([key, count]) => ({
      key,
      count,
      weight: Math.sqrt(count),
      lab: oklab(parseHex(key)),
    }));
  const first = points[0];
  if (!first) throw new Error("No colours to extract");
  const centres: Lab[] = [first.lab];
  while (centres.length < size) {
    let far = first;
    let farScore = -1;
    for (const point of points) {
      const nearest = Math.min(
        ...centres.map((c) => labDistance(c, point.lab)),
      );
      const score = nearest * point.weight;
      if (score > farScore) {
        farScore = score;
        far = point;
      }
    }
    centres.push(far.lab);
  }
  let groups: (typeof points)[] = [];
  for (let iteration = 0; iteration < 40; iteration++) {
    groups = centres.map(() => []);
    for (const point of points) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      centres.forEach((centre, index) => {
        const d = labDistance(centre, point.lab);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = index;
        }
      });
      groups[bestIndex]?.push(point);
    }
    groups.forEach((group, index) => {
      const total = group.reduce((sum, p) => sum + p.weight, 0);
      if (!total) return;
      centres[index] = [0, 1, 2].map(
        (axis) =>
          group.reduce((sum, p) => sum + (p.lab[axis] ?? 0) * p.weight, 0) /
          total,
      ) as unknown as Lab;
    });
  }
  // Snap each centre to the most common real colour nearby.
  return groups
    .map((group, index) => {
      const centre = centres[index] as Lab;
      const close = [...group].sort(
        (a, b) => labDistance(a.lab, centre) - labDistance(b.lab, centre),
      );
      const near = close.slice(0, Math.max(3, Math.ceil(close.length / 4)));
      return near.sort((a, b) => b.count - a.count)[0]?.key;
    })
    .filter((key): key is string => key !== undefined)
    .sort((a, b) => oklab(parseHex(a))[0] - oklab(parseHex(b))[0]);
}

function mergedCounts(names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) {
    const loaded = reference(name);
    for (const [key, count] of histogram(loaded, COLOUR_EXCLUDED[name] ?? [])) {
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
  }
  return counts;
}

const AVATAR_COLOUR_BOXES: readonly { ref: string; box: Box }[] = [
  { ref: "ref-1", box: { x: 772, y: 874, w: 52, h: 88 } },
  { ref: "ref-1", box: { x: 232, y: 744, w: 56, h: 82 } },
  { ref: "ref-1", box: { x: 662, y: 742, w: 56, h: 82 } },
  { ref: "ref-1", box: { x: 934, y: 872, w: 62, h: 88 } },
  { ref: "ref-1", box: { x: 1018, y: 872, w: 66, h: 88 } },
  { ref: "ref-3", box: { x: 470, y: 340, w: 90, h: 145 } },
  { ref: "ref-3", box: { x: 605, y: 340, w: 105, h: 145 } },
  { ref: "ref-4", box: { x: 95, y: 100, w: 55, h: 95 } },
  { ref: "ref-5", box: { x: 300, y: 115, w: 95, h: 110 } },
  { ref: "ref-5", box: { x: 665, y: 100, w: 95, h: 120 } },
  { ref: "ref-5", box: { x: 1030, y: 105, w: 90, h: 130 } },
  { ref: "ref-5", box: { x: 310, y: 440, w: 85, h: 130 } },
  { ref: "ref-5", box: { x: 670, y: 440, w: 85, h: 120 } },
  { ref: "ref-5", box: { x: 1030, y: 445, w: 100, h: 115 } },
];

function avatarCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { ref, box } of AVATAR_COLOUR_BOXES) {
    const loaded = reference(ref);
    const native = clampBox(loaded.native, toNative(loaded, box));
    for (let y = native.y; y < native.y + native.h; y++) {
      for (let x = native.x; x < native.x + native.w; x++) {
        const key = hex(rgbAt(loaded.native, x, y));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const colours = {
  palette32: extractPalette(mergedCounts(["ref-1", "ref-3", "ref-7"]), 32),
  avatarCandidates: extractPalette(avatarCounts(), 48),
};

writeFileSync(
  join(nativeDir, "measurements.json"),
  `${JSON.stringify({ ...measurements, colours }, null, 2)}\n`,
);
console.log(JSON.stringify({ ...measurements, colours }));
