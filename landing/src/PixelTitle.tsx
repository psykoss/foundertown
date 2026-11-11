/**
 * The headline as chunky 3D pixel art. Helvetica is rasterized at the city's art-pixel size, cut to
 * hard pixels, then extruded down-right in black — so it sits in the same
 * pixel grid as the scene behind it. The real <h1> stays in the page for screen readers and search.
 */
import { useEffect, useRef } from "react";
import { artPixel } from "./city/scale";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const FACE = [255, 255, 255], SIDE = [0, 0, 0], EDGE = [0, 0, 0];
/** Extrusion depth and outline, in art pixels. */
const DEPTH = 5;
const PAD = 1;

function draw(canvas: HTMLCanvasElement, lines: string[]) {
  const px = artPixel();
  // as wide as the screen comfortably allows, in art pixels
  const maxW = Math.floor(Math.min(window.innerWidth * 0.78, 820) / px) - DEPTH - 2 * PAD;
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d", { willReadFrequently: true })!;
  sctx.font = `bold 100px ${FONT}`;
  const widest = Math.max(...lines.map((l) => sctx.measureText(l).width));
  const size = Math.floor(Math.min((maxW / widest) * 100, (window.innerHeight * 0.11) / px));
  const lineH = Math.round(size * 0.94);
  const w = Math.ceil((widest * size) / 100) + 4, h = lineH * lines.length + Math.round(size * 0.2);

  // 1. the text as a hard-edged mask
  scratch.width = w;
  scratch.height = h;
  sctx.font = `bold ${size}px ${FONT}`;
  sctx.textAlign = "center";
  sctx.textBaseline = "alphabetic";
  sctx.fillStyle = "#fff";
  lines.forEach((l, i) => sctx.fillText(l, w / 2, Math.round(size * 0.84) + i * lineH));
  const alpha = sctx.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * 4 + 3]! > 120;

  // 2. face + extrusion + outline, back to front
  const W = w + DEPTH + 2 * PAD, H = h + DEPTH + 2 * PAD;
  const kind = new Uint8Array(W * H); // 0 empty, 1 outline, 2 side, 3 face
  const set = (x: number, y: number, k: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H && kind[y * W + x]! < k) kind[y * W + x] = k;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      set(x + PAD, y + PAD, 3);
      for (let d = 1; d <= DEPTH; d++) set(x + PAD + d, y + PAD + d, 2);
    }
  const solid = kind.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (solid[y * W + x]) continue;
      const near = (dx: number, dy: number) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && solid[(y + dy) * W + x + dx]! > 0;
      if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1)) kind[y * W + x] = 1;
    }

  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W * px}px`;
  canvas.style.height = `${H * px}px`;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const tint = [null, EDGE, SIDE, FACE];
  kind.forEach((k, i) => {
    const c = tint[k];
    if (c) img.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4);
  });
  ctx.putImageData(img, 0, 0);
}

export function PixelTitle({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = lines.join("\n");
  useEffect(() => {
    const paint = () => ref.current && draw(ref.current, key.split("\n"));
    paint();
    void document.fonts?.ready.then(paint);
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [key]);
  return (
    <>
      <h1 className="sr-only">{lines.join(" ")}</h1>
      <canvas ref={ref} aria-hidden className="block max-w-none [image-rendering:pixelated]" />
    </>
  );
}
