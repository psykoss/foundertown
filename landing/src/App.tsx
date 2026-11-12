import { CityCanvas } from "./city/CityCanvas";
import { PixelTitle } from "./PixelTitle";

/** Where "Join now" goes: the game client, opened on its sign-up screen (then onboarding, then the town). */
// Production: same site (thefoundertown.com/signup). Dev: the client's own dev server.
const APP_URL: string = (import.meta.env.VITE_APP_URL ?? (import.meta.env.DEV ? "http://localhost:5173" : "")).replace(/\/$/, "");
const JOIN_URL = `${APP_URL}/signup`;

/**
 * Founder Town mark (same art as the game's logo), as pixel art on a 16×16 grid: an isometric block — the first building of a
 * town — with a flag planted on its roof. One color; the faces are told apart by opacity
 * ("#" full: left wall, flag · "r" right wall · "t" roof), the doorway and the window are left empty.
 */
const LOGO_ART = [
  ".......####.....",
  ".......######...",
  ".......####.....",
  ".......#........",
  "......t#tt......",
  "....tttttttt....",
  "..tttttttttttt..",
  "..##ttttttttrr..",
  "..####ttttrrrr..",
  "..######rrrrrr..",
  "..##..##rr..rr..",
  "..##..##rr..rr..",
  "..##..##rrrrrr..",
  "....####rrrr....",
  "......##rr......",
  "................",
];
const LOGO_OPACITY: Record<string, number> = { "#": 1, r: 0.7, t: 0.42 };
/** One rect per horizontal run of the same shade. */
const LOGO_RECTS = LOGO_ART.flatMap((row, y) => {
  const out: { x: number; y: number; w: number; o: number }[] = [];
  for (let x = 0; x < row.length; ) {
    let end = x + 1;
    while (row[end] === row[x]) end++;
    const o = LOGO_OPACITY[row[x]!];
    if (o) out.push({ x, y, w: end - x, o });
    x = end;
  }
  return out;
});

function Mark() {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden className="h-[1.25em] w-[1.25em]">
      {LOGO_RECTS.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill="currentColor" fillOpacity={r.o} />)}
    </svg>
  );
}

export function App() {
  return (
    <main className="h-full w-full bg-yc p-[clamp(12px,2.2vmin,28px)] font-helvetica">
      {/* the city lives in one big rounded frame on the orange page */}
      <div className="relative h-full w-full overflow-hidden rounded-[clamp(20px,4vmin,44px)]">
      <CityCanvas />
      {/* a soft shade behind the words so they read over a busy city */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.3)_0%,rgba(0,0,0,0.14)_34%,rgba(0,0,0,0)_62%)]" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[clamp(0.9rem,2.6vh,1.9rem)] px-6 text-center">
        {/* the name, above the headline: black tag, orange mark */}
        <div className="flex items-center gap-[0.55em] bg-ink py-[0.4em] pl-[0.45em] pr-[0.8em] text-[clamp(0.9rem,1.35vw,1.25rem)] font-bold leading-none tracking-[-0.01em] text-white">
          <span className="grid place-items-center bg-yc p-[0.22em] text-ink"><Mark /></span>
          Founder Town
        </div>
        <PixelTitle lines={["Your startup", "begins here"]} />
        <a
          href={JOIN_URL}
          className="pointer-events-auto border-[3px] border-ink bg-yc px-[1.6em] py-[0.55em] text-[clamp(1rem,1.6vw,1.5rem)] font-bold leading-none tracking-[-0.01em] text-ink no-underline shadow-[5px_5px_0_0_#000] transition-[transform,box-shadow] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_#000] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0_0_#000] motion-reduce:transition-none"
        >
          Join now
        </a>
      </div>
      </div>
    </main>
  );
}
