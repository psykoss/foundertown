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
    ("bookshelf", "office", ("sub", "interiors", 33, (0, 0, 32, 32)), 2, (2, 1)),
    ("shelf_white", "office", ("c", "interiors", 45), 2, (1, 1)),
    ("cabinet", "office", ("c", "interiors", 146), 2, (2, 1)),
    ("wardrobe", "office", ("c", "interiors", 145), 2, (2, 1)),
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
    ("door_wood", "office", ("c", "interiors", 13), 2, (0, 0)),
    ("door_double", "office", ("c", "interiors", 64), 2, (0, 0)),
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
    # ── bathroom (JPEG sheet, ×1) ──
    ("toilet", "bathroom", ("b", "bathroom", (3, 87, 24, 31)), 1, (1, 1)),
    ("toilet_side", "bathroom", ("b", "bathroom", (60, 85, 23, 32)), 1, (1, 1)),
    ("vanity_double", "bathroom", ("b", "bathroom", (201, 0, 61, 56)), 1, (2, 1)),
    ("vanity", "bathroom", ("b", "bathroom", (261, 0, 58, 56)), 1, (2, 1)),
    ("stalls", "bathroom", ("b", "bathroom", (26, 114, 150, 76)), 1, (5, 1)),
    ("urinals", "bathroom", ("b", "bathroom", (42, 10, 64, 34)), 1, (2, 1)),
]

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
        if scale != 1: im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        im = trim(quantize(im))
        os.makedirs(os.path.join(out_dir, room), exist_ok=True)
        rel = f"{room}/{name}.png"
        im.save(os.path.join(out_dir, rel))
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
