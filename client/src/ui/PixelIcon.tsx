/**
 * 12×12 pixel icons for the onboarding answers, keyed by option id (`shared/src/founder.ts`).
 * Each icon is a grid of palette letters ("." = empty) drawn as crisp SVG rects, so it stays
 * sharp at any size. Colors are the game's own ramps (`shared/src/palette.ts`).
 */
import { GOALS, optionLabel } from "@ft/shared";

const COLORS: Record<string, string> = {
  w: "#ffffff", W: "#d6d8e8", s: "#8995ab", S: "#626f7b", k: "#30325b",
  y: "#f7d674", a: "#efa948", A: "#c28433",
  c: "#e86c67", C: "#c25a52", f: "#f9dbc2",
  g: "#6fae81", G: "#3b7057", m: "#abd8b5",
  b: "#579be0", B: "#3e70c2", l: "#90d6f1",
  p: "#8b58d3", P: "#5c43ab", v: "#b479ea",
  t: "#cfa17e", T: "#9f6e5c", n: "#7b4e41",
};

const SIZE = 12;

const ICONS: Record<string, string> = {
  // ── stage ──
  idea: `
....yyyy....
...yyyyyy...
..yywyyyya..
..ywyyyyya..
..yyyyyyya..
..yyyyyyaa..
...yyyyaa...
....yaaa....
....ssss....
....SSSS....
....ssss....
.....SS.....`,
  preseed: `
............
............
.....g......
....gg.gg...
.....gggg...
.....gg.....
.....G......
.....G......
.nnnnGnnnnn.
nTTTTTTTTTTn
nTTnTTTTnTTn
.nnnnnnnnnn.`,
  seed: `
....gg......
...gggg..gg.
...gmgg.gggg
....ggG.gmg.
.....gGggg..
......GG....
......G.....
..cccccccc..
..cCCCCCCc..
...cccccc...
...cccccc...
....CCCC....`,
  series_a: `
.....ww.....
....wwWs....
...wwwWWs...
...wlbWWs...
...wbBWWs...
...wwwWWs...
..cwwwWWsc..
.ccwwwWWscc.
.c.wwwWWs.c.
....aaaa....
....yaay....
.....yy.....`,
  growth: `
............
.........mmm
.........ggg
.....lll.ggg
.....bbb.ggg
.....bbb.ggg
.vvv.bbb.ggg
.ppp.bbb.ggg
.ppp.bbb.ggg
.ppp.bbb.ggg
ssssssssssss
............`,
  unicorn: `
........y...
.......ay...
......ay....
..vvwwww....
.vpwwwwww...
.vpwwwwkww..
.vpwwwwwwww.
..vpwwwwwww.
..vpwwW.www.
...vpww.....
...vpww.....
....WWW.....`,
  investor: `
...aaaaaa...
..ayyyyyyA..
.ayyyAyyyyA.
.ayyAAAAyyA.
.ayyAyyyyyA.
.ayyyAAAyyA.
.ayyyyyAyyA.
.ayyAAAAyyA.
.ayyyAyyyyA.
..ayyyyyyA..
...AAAAAA...
............`,
  operator: `
............
....nnnn....
...n....n...
.TTTTTTTTTT.
.TttttttttT.
.TttttttttT.
.TTTTaaTTTT.
.TttttttttT.
.TttttttttT.
.TTTTTTTTTT.
............
............`,
  curious: `
...vvvvvv...
..vppppppv..
..pp....pp..
........pp..
.......ppP..
.....pppP...
.....ppP....
.....pp.....
............
.....pp.....
.....pP.....
............`,
  // ── goals ──
  learn: `
............
............
bbbbbb.bbbbb
bwwwwwBwwwwb
bwsswwBwsswb
bwwwwwBwwwwb
bwsswwBwsswb
bwwwwwBwwwwb
bwwwwwBwwwwb
bbbbbbBbbbbb
.BBBBB.BBBB.
............`,
  cofounder: `
............
..ff....ff..
.ffff..ffff.
.ffff..ffff.
..ff....ff..
.bbbb..cccc.
bbbbbbcccccc
bbbbbbcccccc
bbbbbbcccccc
bBBbbbccCCcc
............
............`,
  validate: `
...gggggg...
..gggggggg..
.ggggggggwg.
.gggggggwwg.
.ggggggwwgg.
.gwgggwwggg.
.gwwgwwgggg.
.ggwwwggggg.
.gggwgggggg.
..gggggggg..
...GGGGGG...
............`,
  fundraise: `
....nnnn....
....TttT....
.....TT.....
....tttt....
...tttttt...
..ttttAttt..
.tttAAAAttT.
.tttAttttTT.
.ttttAAAtTT.
.tttAAAAtTT.
..tttAtTTT..
...TTTTTT...`,
  customers: `
...cccccc...
..cccccccc..
.cccwwwwccc.
.ccwwwwwwcc.
.ccwwccwwcc.
.ccwwccwwcc.
.ccwwwwwwcc.
.cccwwwwccc.
..cccccccc..
...CCCCCC...
............
............`,
  hire: `
............
...ff.......
..ffff......
..ffff...g..
...ff....g..
..pppp.ggggg
.pppppp..g..
.pppppp..g..
.pppppp.....
.pPPPPp.....
............
............`,
  network: `
...s..s.....
....s..s....
...s..s.....
............
.wwwwwwww...
.wnnnnnnwww.
.wwwwwwww.w.
.wwwwwwww.w.
.wwwwwwwww..
..wwwwww....
..WWWWWW....
.ssssssss...`,
  // ── how you heard ──
  friend: `
............
..ccc..ccc..
.cfcccccccc.
.cfccccccCc.
.ccccccccCc.
.cccccccCCc.
..ccccccCC..
...ccccCC...
....ccCC....
.....CC.....
............
............`,
  x: `
............
.ww......ww.
.www....www.
..www..www..
...wwwwww...
....wwww....
....wwww....
...wwwwww...
..www..www..
.www....www.
.ww......ww.
............`,
  linkedin: `
.bbbbbbbbbb.
bbbbbbbbbbbb
bbwwbbbbbbbb
bbbbbbbbbbbb
bbwwbwwwwbbb
bbwwbwwwwwbb
bbwwbwwbwwbb
bbwwbwwbwwbb
bbwwbwwbwwbb
bbbbbbbbbbbb
bbbbbbbbbbbb
.BBBBBBBBBB.`,
  producthunt: `
...cccccc...
..cccccccc..
.cccwwwwccc.
.cccwccwwcc.
.cccwcccwcc.
.cccwccwwcc.
.cccwwwwccc.
.cccwcccccc.
.cccwcccccc.
..cccccccc..
...CCCCCC...
............`,
  community: `
............
............
wwwwwwwwwwww
wsWWWWWWWWsw
wWsWWWWWWsWw
wWWsWWWWsWWw
wWWWssssWWWw
wWWWWWWWWWWw
wWWWWWWWWWWw
wwwwwwwwwwww
............
............`,
  search: `
...ssss.....
..slllls....
.sllwllls...
.slwlllls...
.sllllls....
.sllllls....
..slllls....
...sssssn...
.......nTn..
........nTn.
.........nTn
..........nn`,
  other: `
.....y......
.....y......
....yay.....
....yay.....
..yyaaayy...
yyaaawaaayy.
..yyaaayy...
....yay.....
....yay.....
.....y...y..
.....y..yay.
.........y..`,
};

/** One `<rect>` per horizontal run of the same color. */
function runs(art: string) {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  art.trim().split("\n").forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x]!;
      let end = x + 1;
      while (row[end] === ch) end++;
      if (COLORS[ch]) out.push({ x, y, w: end - x, fill: COLORS[ch] });
      x = end;
    }
  });
  return out;
}

const cache = new Map<string, ReturnType<typeof runs>>();

/** `size` in px — use a multiple of 12 so every art pixel is a whole number of screen pixels. */
export function PixelIcon({ id, size = 36 }: { id: string; size?: number }) {
  const art = ICONS[id];
  if (!art) return null;
  let rects = cache.get(id);
  if (!rects) cache.set(id, (rects = runs(art)));
  return (
    <svg className="pixel-icon" width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges" aria-hidden>
      {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  );
}

/** A founder's goals as chips: the onboarding icon at one screen pixel per art pixel, then the label. */
export function GoalChips({ goals }: { goals: string[] }) {
  return (
    <div className="chips">
      {goals.map((g) => (
        <span key={g} className="chip">
          <PixelIcon id={g} size={SIZE} />
          {optionLabel(GOALS, g)}
        </span>
      ))}
    </div>
  );
}
