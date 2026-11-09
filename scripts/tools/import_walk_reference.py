"""
One-off tool: import the walk cycle from a screen recording of the reference game into
art/characters/reference/base_walk.png (+ base_walk.json).

  python3 scripts/tools/import_walk_reference.py <video.mov>

How it works
- the recording shows the 32x64 character at exactly 8x; grid origin (-44, -198) px
- frames are deduplicated (each pose is held ~8 video frames), then sampled at cell centers,
  background removed by flood fill from the frame border, colors snapped to the reference palette
- cycles (4 frames each) were identified by pairwise frame comparison of the 2026-11-09 21:06:52 recording:
    down: segments 48,49,50,51   up: 39,40,41,42   left: 5,6,7,8   (pass, stride, pass, stride)
- the camera follows the walker, so absolute position is not reliable: each cycle is anchored so its
  lowest (planted) foot sits on row 61; the remaining up/down offsets between frames are the real bob
- the head is static art: it is replaced by the base head (base_body.png) at the detected bob offset,
  so heads/hair/hats stay identical to idle and only move with the whole-body bob.
Requires: ffmpeg, Pillow.
"""
import json, os, subprocess, sys, tempfile, glob
from PIL import Image, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OX, OY, S = -44, -198, 8
CYCLES = {"down": [48, 49, 50, 51], "up": [39, 40, 41, 42], "left": [5, 6, 7, 8]}
FEET_ROW = 61
DIR_COL = {"down": 0, "up": 1, "left": 2}  # column of each direction in base_body.png
CANON = ['#000000', '#75412b', '#ab633b', '#d8885c', '#f9bf95', '#f4845c', '#222034', '#663931',
         '#fffefd', '#ece9f0', '#ffffff', '#c8c2d1', '#9193a6']
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
CR = [rgb(c) for c in CANON]
HEAD_BOTTOM = {"down": 44, "up": 44, "left": 45}

def is_chin(d, x, y):
    return d != "left" and ((y == 45 and 10 <= x <= 21) or (y == 46 and 11 <= x <= 20))

def in_head(d, x, y, dy):
    return y - dy <= HEAD_BOTTOM[d] or is_chin(d, x, y - dy)

def segments(frames):
    segs, prev, start = [], None, 0
    for i, f in enumerate(frames):
        im = Image.open(f).convert("RGB")
        if prev is not None:
            diff = ImageChops.difference(im, prev).convert("L").point(lambda v: 255 if v > 40 else 0).histogram()[255]
            if diff > 30:
                segs.append((start, i - 1)); start = i
        prev = im
    segs.append((start, len(frames) - 1))
    return [s for s in segs if s[1] - s[0] + 1 >= 4]

def sample(im, open_top):
    px = im.load(); W, H = im.size
    grid = {}
    for r in range(64):
        for c in range(32):
            x, y = OX + c * S + S // 2, OY + r * S + S // 2
            if 0 <= x < W and 0 <= y < H:
                grid[(c, r)] = px[x, y]
    keys = set(grid)
    black = {k for k, v in grid.items() if sum(v) < 120}
    top = min(r for _, r in keys)
    def on_border(k):
        x, y = k
        if open_top and y == top: return False
        return any(n not in keys for n in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    bg, st = set(), [k for k in keys if on_border(k) and k not in black]
    while st:
        k = st.pop()
        if k in bg or k in black or k not in keys: continue
        bg.add(k); x, y = k
        st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    out = {}
    for k, v in grid.items():
        if k in bg: continue
        i = min(range(len(CR)), key=lambda i: sum((a - b) ** 2 for a, b in zip(CR[i], v)))
        out[k] = CANON[i]
    return out

def main(video):
    base = Image.open(os.path.join(ROOT, "art/characters/reference/base_body.png")).convert("RGBA")
    tmp = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-v", "error", "-i", video, os.path.join(tmp, "f_%04d.png")], check=True)
    frames = sorted(glob.glob(os.path.join(tmp, "f_*.png")))
    segs = segments(frames)
    strip = Image.new("RGBA", (4 * 32, 3 * 64), (0, 0, 0, 0))
    motion = {}
    for d, cyc in CYCLES.items():
        bx = DIR_COL[d] * 32
        head = {(x, y): base.getpixel((bx + x, y)) for y in range(64) for x in range(32)
                if base.getpixel((bx + x, y))[3] and in_head(d, x, y, 0)}
        motion[d] = []
        grids = []
        for k in cyc:
            s, e = segs[k]
            grids.append(sample(Image.open(frames[(s + e) // 2]).convert("RGB"), open_top=True))
        shift = FEET_ROW - max(y for g in grids for (_, y) in g)
        for fi, g in enumerate(grids):
            g = {(x, y + shift): c for (x, y), c in g.items()}
            # detect bob: best head alignment
            best = None
            for dy in (-2, -1, 0, 1):
                for dx in (-1, 0, 1):
                    miss = sum(1 for (x, y), p in head.items()
                               if (x + dx, y + dy) in g and g[(x + dx, y + dy)] != '#%02x%02x%02x' % p[:3])
                    miss += sum(1 for (x, y) in head if (x + dx, y + dy) not in g and y + dy > 30)
                    if best is None or miss < best[0]: best = (miss, dx, dy)
            _, dx, dy = best
            motion[d].append({"dx": dx, "dy": dy})
            ox = fi * 32; oy = DIR_COL[d] * 64
            for (x, y), c in g.items():
                if c == '#fffefd':
                    c = '#ffffff'  # body whites are undershirt, not eye white
                if 0 <= x < 32 and 0 <= y < 64 and not in_head(d, x - dx, y, dy):
                    strip.putpixel((ox + x, oy + y), rgb(c) + (255,))
            for (x, y), p in head.items():
                if 0 <= x + dx < 32 and 0 <= y + dy < 64:
                    strip.putpixel((ox + x + dx, oy + y + dy), p)
    out = os.path.join(ROOT, "art/characters/reference/base_walk.png")
    strip.save(out)
    json.dump({"frames": 4, "rows": ["down", "up", "left"], "motion": motion},
              open(out.replace(".png", ".json"), "w"), indent=2)
    print("wrote", out, json.dumps(motion))

if __name__ == "__main__":
    main(sys.argv[1])
