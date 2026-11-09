"""
Slice a sprite sheet (transparent PNG, or flat-background JPG) into individual sprites at native scale.

  python3 scripts/tools/slice_sheet.py <sheet> <out_dir> [--scale N] [--bg auto|none] [--gap G]

- --scale N : the sheet is drawn at N× → downsample to 1× (grid offset auto-detected)
- --bg auto : treat the most common border color as background (for JPG/flat sheets); tolerance 24
- sprites = connected components (8-neighbour) merged when their boxes are within --gap px
- writes <out_dir>/<id>.png and <out_dir>/_contact.png (ids drawn next to each sprite)
"""
import os, sys, argparse
from collections import Counter
from PIL import Image, ImageDraw

def downscale(im, s):
    if s == 1: return im
    W, H = im.size; px = im.load()
    best = None
    for o in range(s):
        bad = 0
        for y in range(o, min(H, 600) - s, s):
            for x in range(o, W - s, s):
                c = px[x, y]
                for d in range(1, s):
                    if px[x + d, y] != c or px[x, y + d] != c: bad += 1
        if best is None or bad < best[0]: best = (bad, o)
    o = best[1]
    out = Image.new("RGBA", ((W - o) // s, (H - o) // s))
    op = out.load()
    for y in range(out.height):
        for x in range(out.width):
            op[x, y] = px[o + x * s + s // 2, o + y * s + s // 2]
    return out

def remove_bg(im, tol=24):
    """Flood-fill the background from the border (keeps white/grey parts inside sprites)."""
    im = im.convert("RGBA"); px = im.load(); W, H = im.size
    border = [px[x, 0] for x in range(W)] + [px[x, H - 1] for x in range(W)] + [px[0, y] for y in range(H)] + [px[W - 1, y] for y in range(H)]
    bg = Counter(p[:3] for p in border).most_common(1)[0][0]
    near = lambda p: abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) <= tol
    seen = set(); st = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    while st:
        x, y = st.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H) or not near(px[x, y]): continue
        seen.add((x, y)); px[x, y] = (0, 0, 0, 0)
        st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im

NB = {8: [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)], 4: [(1, 0), (-1, 0), (0, 1), (0, -1)]}

def components(im, gap, amin=128, conn=8):
    W, H = im.size; px = im.load()
    seen = [[False] * W for _ in range(H)]
    boxes = []
    for y0 in range(H):
        for x0 in range(W):
            if seen[y0][x0] or px[x0, y0][3] < amin: continue
            st = [(x0, y0)]; seen[y0][x0] = True
            x1 = x2 = x0; y1 = y2 = y0
            while st:
                x, y = st.pop()
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for dx, dy in NB[conn]:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and px[nx, ny][3] >= amin:
                            seen[ny][nx] = True; st.append((nx, ny))
            boxes.append([x1, y1, x2, y2])
    merged = True
    while merged:
        merged = False
        out = []
        for b in boxes:
            for o in out:
                if b[0] <= o[2] + gap and o[0] <= b[2] + gap and b[1] <= o[3] + gap and o[1] <= b[3] + gap:
                    o[0], o[1], o[2], o[3] = min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3])
                    merged = True; break
            else:
                out.append(b)
        boxes = out
    return sorted([b for b in boxes if (b[2] - b[0] + 1) * (b[3] - b[1] + 1) >= 12], key=lambda b: (b[1] // 16, b[0]))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet"); ap.add_argument("out")
    ap.add_argument("--scale", type=int, default=1); ap.add_argument("--bg", default="none"); ap.add_argument("--gap", type=int, default=1)
    ap.add_argument("--alpha", type=int, default=128); ap.add_argument("--conn", type=int, default=8)
    ap.add_argument("--crop", default="", help="x,y,w,h region (after downscale) to slice")
    a = ap.parse_args()
    im = Image.open(a.sheet).convert("RGBA")
    im = downscale(im, a.scale)
    if a.bg == "auto": im = remove_bg(im)
    if a.crop:
        x, y, w, h = map(int, a.crop.split(",")); im = im.crop((x, y, x + w, y + h))
    os.makedirs(a.out, exist_ok=True)
    boxes = components(im, a.gap, a.alpha, a.conn)
    # contact sheet at 3x with ids
    k = 3
    cs = Image.new("RGB", (im.width * k, im.height * k), (60, 60, 60))
    cs.paste(im.resize((im.width * k, im.height * k), Image.NEAREST), (0, 0), im.resize((im.width * k, im.height * k), Image.NEAREST))
    d = ImageDraw.Draw(cs)
    for i, (x1, y1, x2, y2) in enumerate(boxes):
        im.crop((x1, y1, x2 + 1, y2 + 1)).save(os.path.join(a.out, f"{i:03d}.png"))
        d.rectangle([x1 * k, y1 * k, (x2 + 1) * k - 1, (y2 + 1) * k - 1], outline=(255, 0, 255))
        d.text((x1 * k + 1, y1 * k + 1), str(i), fill=(255, 255, 0))
    cs.save(os.path.join(a.out, "_contact.png"))
    print(f"{len(boxes)} sprites → {a.out} (native size {im.size})")

if __name__ == "__main__":
    main()
