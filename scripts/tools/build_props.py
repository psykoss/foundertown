"""
Build the prop library (art/props/) from the source sprite sheets.

  python3 scripts/tools/build_props.py <uploads_dir>

Every prop in MANIFEST is: cropped from a sheet (by sliced component id or by box), scaled to game scale
(16px-scale interiors ×2, 32px-scale kitchen/bathroom/office ×1), optionally mirrored for the other facing,
recolored to the office palette (PROP_PALETTE: colors sampled from the reference office screenshots), and
written to art/props/<room>/<name>.png. art/props/props.json lists name, file, size and tile footprint.

The asset pipeline (gen-placeholders.ts) copies art/props → client/public/assets/furniture and the map
generator places props by name.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
import slice_sheet as sl  # noqa: E402

SHEETS = {
    # key: (file, native downscale, background removal)
    "interiors": ("132f186d-image.png", 2, "none"),
    "kitchen": ("7170fe69-image.png", 1, "none"),
    "walls": ("9452c87f-image.png", 1, "none"),
    "floors": ("cbe7c8d8-image.png", 2, "none"),
    "bathroom": ("f2fa5ae9-image.jpg", 1, "auto"),
    "desk": ("15dd8cbc-image.png", 8, "none"),
}

# Office palette: sampled from the reference office screenshots + the game's env ramps.
PROP_PALETTE = [
    "#ede4da", "#ecdbc7", "#e8d3b4", "#e0b693", "#cfa17e", "#a97d60", "#9f6e5c", "#875c40", "#7b4e41",
    "#efedf6", "#f8f6fc", "#ffffff", "#dde4f1", "#d6d8e8", "#dbddeb", "#c4c6d8", "#b2bdce", "#a3aeb2",
    "#97a3a7", "#8995ab", "#839194", "#7d8291", "#6e7b7d", "#626f7b", "#596367", "#4b5062", "#30325b",
    "#2b2c2b", "#52567b", "#565e82", "#7b7dae", "#888dc9", "#919ed6", "#a3aad9", "#5c4ebe", "#5c43ab",
    "#404ea7", "#3e70c2", "#579be0", "#90d6f1", "#9fc6cd", "#66c1ce", "#509ab9", "#396e9e", "#b5dfd6",
    "#ddeedc", "#d3e3d2", "#abd8b5", "#97c5a0", "#96d975", "#6fae81", "#528f5f", "#3b7057", "#f7d674",
    "#efd1a2", "#efa948", "#c28433", "#ac5633", "#e86c67", "#c25a52", "#f9dbc2", "#b479ea", "#8b58d3",
]
_P = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PROP_PALETTE]

def quantize(im):
    """Snap every opaque pixel to the nearest palette color (weighted RGB); drop translucent shadows."""
    im = im.convert("RGBA"); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 160:
                px[x, y] = (0, 0, 0, 0); continue
            c = min(_P, key=lambda p: 2 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 3 * (p[2] - b) ** 2)
            px[x, y] = c + (255,)
    return im

def scale2x(im):
    """EPX/Scale2x: pixel-art upscale that rebuilds diagonals at 2× instead of copying 2×2 blocks."""
    im = im.convert("RGBA"); W, H = im.size; src = im.load()
    out = Image.new("RGBA", (W * 2, H * 2)); o = out.load()
    g = lambda x, y: src[min(max(x, 0), W - 1), min(max(y, 0), H - 1)]
    for y in range(H):
        for x in range(W):
            P, A, B, C, D = g(x, y), g(x, y - 1), g(x + 1, y), g(x - 1, y), g(x, y + 1)
            o[2 * x, 2 * y] = A if C == A and C != D and A != B else P
            o[2 * x + 1, 2 * y] = B if A == B and A != C and B != D else P
            o[2 * x, 2 * y + 1] = C if D == C and D != B and C != A else P
            o[2 * x + 1, 2 * y + 1] = D if B == D and B != A and D != C else P
    return out

def _nearest(rgb):
    r, g, b = rgb
    return min(_P, key=lambda p: 2 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 3 * (p[2] - b) ** 2)

def _step(c, toward, k):
    """Next palette color from c toward `toward` (lighter/darker), or c if none differs."""
    for t in (k, k * 1.6, k * 2.4):
        n = _nearest(tuple(int(c[i] * (1 - t) + toward[i] * t) for i in range(3)))
        if n != c[:3]: return n
    return c[:3]

def reshade(im):
    """32px shading pass: light from the top-left → 1px highlight rim inside top/left edges,
    1px shadow rim inside bottom/right edges, one palette step each. Outlines/darks untouched."""
    im = im.copy(); px = im.load(); W, H = im.size
    src = im.copy().load()
    op = lambda x, y: 0 <= x < W and 0 <= y < H and src[x, y][3] > 0
    lum = lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
    for y in range(H):
        for x in range(W):
            c = src[x, y]
            if not c[3] or lum(c) < 70: continue
            if not all(op(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): continue  # edge px
            dark = lambda q: lum(q) < lum(c) - 45
            up, left = src[x, y - 1], src[x - 1, y]
            down, right = src[x, y + 1], src[x + 1, y]
            if dark(up) or dark(left):
                px[x, y] = _step(c, (255, 255, 255), 0.18) + (255,)
            elif dark(down) or dark(right):
                px[x, y] = _step(c, (48, 50, 91), 0.18) + (255,)
    return im

def trim(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im

_cache = {}
def sheet(key, uploads):
    if key not in _cache:
        f, s, bg = SHEETS[key]
        im = Image.open(os.path.join(uploads, f)).convert("RGBA")
        im = sl.downscale(im, s)
        if bg == "auto": im = sl.remove_bg(im, tol=40)
        if key == "desk":  # strip the carpet (and its shadow tones) around the reference desk
            px = im.load()
            carpet = {(136, 141, 201), (145, 158, 214), (86, 94, 130), (82, 86, 123), (87, 95, 131), (82, 86, 125)}
            for y in range(im.height):
                for x in range(im.width):
                    if px[x, y][:3] in carpet: px[x, y] = (0, 0, 0, 0)
        _cache[key] = (im, sl.components(im, 0, 255, 4) if key == "interiors" else sl.components(im, 0))
    return _cache[key]

def component(key, idx, uploads):
    im, boxes = sheet(key, uploads)
    x1, y1, x2, y2 = boxes[idx]
    return im.crop((x1, y1, x2 + 1, y2 + 1))

def box(key, b, uploads):
    im, _ = sheet(key, uploads)
    x, y, w, h = b
    return trim(im.crop((x, y, x + w, y + h)))

# name, room, source, scale, footprint (tiles w,h), extra
# source: ("c", sheet, id) component | ("b", sheet, (x,y,w,h)) box | ("sub", sheet, id, (x,y,w,h)) box inside a component
MANIFEST = [
    # ── office ──
    ("desk", "office", ("desk_part", "desk"), 1, (3, 1)),
    ("office_chair", "office", ("desk_part", "chair"), 1, (1, 1)),
    ("plant_tree", "office", ("c", "interiors", 130), 2, (1, 1)),
    ("plant_small", "office", ("c", "interiors", 134), 2, (1, 1)),
    ("plant_desk", "office", ("c", "interiors", 148), 2, (1, 1)),
    ("lamp_blue", "office", ("c", "interiors", 161), 2, (1, 1)),
    ("lamp_red", "office", ("c", "interiors", 162), 2, (1, 1)),
    ("chalkboard", "office", ("c", "interiors", 124), 2, (2, 1)),
    ("monitor_desk", "office", ("c", "interiors", 12), 2, (1, 1)),
    ("painting_sunset", "office", ("c", "interiors", 50), 2, (0, 0)),
    ("painting_sea", "office", ("c", "interiors", 57), 2, (0, 0)),
    ("painting_forest", "office", ("c", "interiors", 56), 2, (0, 0)),
    ("window", "office", ("c", "interiors", 63), 2, (0, 0)),
    ("window_wide", "office", ("c", "interiors", 70), 2, (0, 0)),
    ("rug_red", "office", ("c", "interiors", 38), 2, (0, 0)),
    ("rug_blue", "office", ("c", "interiors", 24), 2, (0, 0)),
    ("rug_small_blue", "office", ("c", "interiors", 51), 2, (0, 0)),
    ("rug_green", "office", ("c", "interiors", 72), 2, (0, 0)),
    # ── lounge ──
    ("sofa_red", "lounge", ("c", "interiors", 46), 2, (3, 1)),
    ("sofa_grey", "lounge", ("b", "interiors", (16, 1150, 47, 34)), 2, (3, 1)),
    ("sofa_side_a", "lounge", ("b", "interiors", (57, 1222, 22, 58)), 2, (1, 2)),
    ("sofa_side_b", "lounge", ("b", "interiors", (81, 1222, 22, 58)), 2, (1, 2)),
    ("coffee_table", "lounge", ("c", "interiors", 29), 2, (2, 1)),
    # ── meeting ──
    ("table_meeting", "meeting", ("c", "interiors", 17), 2, (2, 2)),
    ("chair_front", "meeting", ("c", "interiors", 75), 2, (1, 1)),
    ("chair_back", "meeting", ("c", "interiors", 86), 2, (1, 1)),
    ("chair_left", "meeting", ("c", "interiors", 79), 2, (1, 1)),
    ("chair_right", "meeting", ("c", "interiors", 79, "flip"), 2, (1, 1)),
    # ── kitchen (32px-scale sheet, ×1) ──
    ("counter_drawers", "kitchen", ("c", "kitchen", 119), 1, (1, 1)),
    ("counter", "kitchen", ("c", "kitchen", 120), 1, (1, 1)),
    ("counter_cabinet", "kitchen", ("c", "kitchen", 123), 1, (1, 1)),
    ("counter_doors", "kitchen", ("c", "kitchen", 124), 1, (1, 1)),
    ("sink", "kitchen", ("c", "kitchen", 90), 1, (1, 1)),
    ("sink_double", "kitchen", ("c", "kitchen", 89), 1, (1, 1)),
    ("stove", "kitchen", ("c", "kitchen", 101), 1, (1, 1)),
    ("fridge", "kitchen", ("c", "kitchen", 134), 1, (1, 1)),
    ("kitchen_shelf", "kitchen", ("c", "kitchen", 144), 1, (1, 1)),
    ("microwave", "kitchen", ("c", "kitchen", 22), 1, (0, 0)),
    ("mixer", "kitchen", ("c", "kitchen", 72), 1, (0, 0)),
    ("coffee_machine", "kitchen", ("sub", "kitchen", 21, (0, 0, 16, 29)), 1, (0, 0)),
    ("table_dining", "kitchen", ("c", "interiors", 19), 2, (2, 2)),
    ("door_white", "kitchen", ("b", "walls", (0, 293, 32, 68)), 1, (0, 0)),
    ("door_metal", "kitchen", ("b", "walls", (209, 293, 64, 68)), 1, (0, 0)),
    # ── bathroom (JPEG sheet, ×1; toilet/urinal/stall are drawn clean in draw_bathroom()) ──
]

def clean(im, min_size=6):
    """Despeckle (JPEG sources): drop tiny components and single pixels hanging off the silhouette."""
    im = im.copy(); px = im.load(); W, H = im.size
    opaque = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y][3] > 0
    for _ in range(2):  # pixels with ≤1 opaque 4-neighbour are spurs/specks
        kill = [(x, y) for y in range(H) for x in range(W)
                if opaque(x, y) and sum(opaque(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) <= 1]
        for x, y in kill: px[x, y] = (0, 0, 0, 0)
    seen = set()
    for y0 in range(H):
        for x0 in range(W):
            if (x0, y0) in seen or not opaque(x0, y0): continue
            comp, st = [], [(x0, y0)]; seen.add((x0, y0))
            while st:
                x, y = st.pop(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    n = (x + dx, y + dy)
                    if n not in seen and opaque(*n): seen.add(n); st.append(n)
            if len(comp) < min_size:
                for x, y in comp: px[x, y] = (0, 0, 0, 0)
    return im

# ── clean, procedurally drawn bathroom fixtures (palette colors, soft outlines, no JPEG noise) ──
WHITE, OFF, LIGHT, MID = "#ffffff", "#efedf6", "#d6d8e8", "#b2bdce"
EDGE, DARK, DARKER = "#8995ab", "#626f7b", "#4b5062"
WATER, WATER2, CHROME, DOOR, DOOR_EDGE = "#90d6f1", "#66c1ce", "#a3aeb2", "#dde4f1", "#c4c6d8"

def _rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

class Pix:
    def __init__(self, w, h): self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); self.px = self.im.load()
    def set(self, x, y, c):
        if 0 <= x < self.im.width and 0 <= y < self.im.height: self.px[x, y] = _rgb(c)
    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w): self.set(xx, yy, c)
    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1: self.set(x, y, c)
    def outline(self, c=EDGE):
        """Soft outline: every opaque pixel touching transparency becomes the edge color."""
        W, H = self.im.size; px = self.px
        edge = [(x, y) for y in range(H) for x in range(W) if px[x, y][3] and any(
            not (0 <= x + dx < W and 0 <= y + dy < H) or not px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in edge: self.set(x, y, c)

def draw_toilet():
    p = Pix(20, 28)
    p.rect(2, 0, 16, 8, OFF); p.rect(2, 0, 16, 1, WHITE); p.rect(2, 7, 16, 1, MID)   # tank against the wall
    p.ellipse(10, 16.5, 9, 8, OFF); p.ellipse(10, 15.5, 8, 6.5, WHITE)                 # bowl + seat
    p.ellipse(10, 16.5, 5, 4.5, MID); p.ellipse(10, 17, 3.6, 3, WATER); p.ellipse(9.5, 16.5, 1.5, 1.2, WATER2)
    p.rect(6, 23, 8, 5, LIGHT)                                                           # pedestal
    p.outline(); p.rect(8, 2, 4, 1, CHROME)                                              # flush button
    return p.im

def draw_urinal():
    p = Pix(14, 25)
    p.rect(6, 0, 2, 5, CHROME); p.rect(4, 0, 6, 2, CHROME)                               # flush pipe
    p.rect(1, 5, 12, 18, OFF); p.rect(2, 4, 10, 1, OFF); p.rect(2, 23, 10, 2, LIGHT)
    p.rect(3, 9, 8, 11, LIGHT); p.rect(4, 10, 6, 9, MID); p.rect(6, 17, 2, 1, EDGE)     # basin + drain
    p.rect(1, 5, 12, 1, WHITE)
    p.outline(); p.rect(6, 0, 2, 1, EDGE)
    return p.im

def draw_stall(open_door=False):
    p = Pix(34, 60)
    for x in (0, 31):                                                                    # partition posts
        p.rect(x, 0, 3, 58, DARK); p.rect(x, 0, 1, 58, DARKER); p.rect(x, 58, 3, 2, DARKER)
    p.rect(0, 0, 34, 3, DARK); p.rect(0, 0, 34, 1, EDGE)                                 # top rail
    if open_door:
        t = draw_toilet(); p.im.alpha_composite(t, (7, 20))                              # toilet inside
        p.rect(3, 4, 4, 50, DOOR); p.rect(6, 4, 1, 50, DOOR_EDGE)                       # door swung open
    else:
        p.rect(3, 4, 28, 50, DOOR); p.rect(3, 4, 28, 1, WHITE); p.rect(3, 53, 28, 1, DOOR_EDGE)
        p.rect(3, 4, 1, 50, DOOR_EDGE); p.rect(30, 4, 1, 50, DOOR_EDGE)
        p.rect(26, 28, 2, 3, CHROME); p.rect(26, 31, 2, 1, EDGE)                          # handle
        p.rect(15, 8, 4, 2, "#6fae81")                                                   # vacant indicator
    return p.im

def gather_shelves(uploads):
    """
    Bookshelves in the reference office style (white top, grey frame, colored books), sampled from the
    reference screenshot (8×, offset 2,6). Native shelf: cols 30–61, top surface rows 18–23, four shelf
    units of 6 rows (24–47), bottom rows 48–49. Bigger variants repeat shelf units / join two shelves.
    """
    from collections import Counter
    src = Image.open(os.path.join(uploads, "69e95f1f-image.png")).convert("RGB"); sp = src.load()
    s, ox, oy = 8, 2, 6
    def cell(x, y):
        c = Counter(sp[ox + x * s + dx, oy + y * s + dy] for dx in range(2, 6) for dy in range(2, 6))
        return c.most_common(1)[0][0]
    grid = {(x, y): cell(x, y) for y in range(56) for x in range(97)}
    TOP, EDGE, WALL = (239, 237, 246), (137, 149, 171), {(110, 123, 125), (131, 145, 148), (89, 99, 103)}
    def shelf_rows():
        rows = []
        for y in range(18, 50):
            row = [grid[(x, y)] for x in range(30, 62)]
            if y <= 23: row = [EDGE] + [TOP] * 30 + [EDGE]  # clean top surface (plant becomes its own prop)
            rows.append(row)
        return rows
    def to_img(rows):
        im = Image.new("RGBA", (len(rows[0]), len(rows)))
        for y, r in enumerate(rows):
            for x, c in enumerate(r): im.putpixel((x, y), c + (255,))
        return quantize(im)
    base = shelf_rows()                              # 32 rows: top 0–5, units 6–11/12–17/18–23/24–29, bottom 30–31
    unit = base[12:18]
    tall = base[:30] + unit + unit + base[30:]       # 6 book rows → 44 px
    wide = [l[:-1] + r[1:] for l, r in zip(tall, tall)]  # two tall shelves sharing the middle post
    plant = Image.new("RGBA", (11, 13))
    for y in range(11, 24):
        for x in range(31, 42):
            c = grid[(x, y)]
            if c in WALL or c == TOP: continue
            if y >= 18 and not (32 <= x <= 39): continue  # below the leaves only the pot remains
            plant.putpixel((x - 31, y - 11), c + (255,))
    return [("bookshelf", to_img(base), (1, 1)), ("bookshelf_tall", to_img(tall), (1, 1)),
            ("bookshelf_wide", to_img(wide), (2, 1)), ("plant_pot", trim(quantize(plant)), (0, 0))]

def desk_parts(uploads):
    im, boxes = sheet("desk", uploads)
    parts = sorted([im.crop((b[0], b[1], b[2] + 1, b[3] + 1)) for b in boxes], key=lambda p: -p.width * p.height)
    desk = parts[0]
    chair = max(parts[1:], key=lambda p: p.width * p.height)
    return {"desk": desk, "chair": chair}

def main(uploads):
    out_dir = os.path.join(ROOT, "art/props")
    meta = []
    dp = None
    for name, room, src, scale, fp in MANIFEST:
        kind = src[0]
        if kind == "desk_part":
            dp = dp or desk_parts(uploads); im = dp[src[1]]
        elif kind == "c":
            im = component(src[1], src[2], uploads)
            if len(src) > 3 and src[3] == "flip": im = im.transpose(Image.FLIP_LEFT_RIGHT)
        elif kind == "sub":
            im = trim(component(src[1], src[2], uploads).crop(tuple(src[3][:2]) + (src[3][0] + src[3][2], src[3][1] + src[3][3])))
        else:
            im = box(src[1], src[2], uploads)
        if scale == 2: im = reshade(quantize(scale2x(quantize(im))))  # 16px art → 32px detail + shading
        elif scale != 1: im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        im = trim(quantize(im))
        if src[0] == "b" and src[1] == "bathroom": im = trim(clean(im))
        if fp != (0, 0):  # footprint from the sprite's own width (1 row deep; side sofas 2)
            fp = (max(1, round(im.width / 32)), fp[1] if name.startswith("sofa_side") else 1)
        os.makedirs(os.path.join(out_dir, room), exist_ok=True)
        rel = f"{room}/{name}.png"
        im.save(os.path.join(out_dir, rel))
        meta.append({"name": name, "file": rel, "w": im.width, "h": im.height, "footprintW": fp[0], "footprintH": fp[1]})
    for name, im, fp in gather_shelves(uploads):
        rel = f"office/{name}.png"; im.save(os.path.join(out_dir, rel))
        meta.append({"name": name, "file": rel, "w": im.width, "h": im.height, "footprintW": fp[0], "footprintH": fp[1]})
    # floor textures (16px patterns → 32px tiles)
    fl, _ = sheet("floors", uploads)
    tex = {"floor_red_tile": (176, 80), "floor_yellow_tile": (176, 112), "floor_bath_tile": (176, 144), "floor_concrete": (176, 176), "floor_herringbone": (176, 208)}
    os.makedirs(os.path.join(out_dir, "floors"), exist_ok=True)
    for n, (x, y) in tex.items():
        t = quantize(fl.crop((x, y, x + 32, y + 32)))
        t.save(os.path.join(out_dir, "floors", n + ".png"))
    json.dump({"props": meta}, open(os.path.join(out_dir, "props.json"), "w"), indent=1)
    print(f"{len(meta)} props + {len(tex)} floor textures → art/props/")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads")
