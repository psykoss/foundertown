"""
Proportion check for the prop library: every prop vs the character (33 px tall, ~20 px wide).

  python3 scripts/tools/check_props.py          → table + exit 1 on any failure

- UPSCALED: a sprite whose pixels all come in uniform 2×2 blocks is low-res art drawn at 2× (chunky next
  to the 1×-density characters) → must be used at 1×.
- SIZE: each prop's height must sit in the range expected for its kind, relative to the character.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CHAR_H = 33

# kind → (min h, max h) in px. Order matters: first keyword match wins.
RANGES = [
    ("plant_desk", (8, 20)), ("monitor", (16, 32)), ("counter", (32, 44)), ("office_chair", (14, 24)), ("chair", (12, 26)), ("desk", (28, 44)), ("table", (18, 44)),
    ("sofa", (20, 60)), ("lamp", (24, 44)), ("plant_tree", (24, 44)), ("plant_small", (16, 34)),
    ("plant_desk", (8, 20)), ("bookshelf", (24, 48)), ("shelf", (24, 64)), ("cabinet", (24, 48)),
    ("wardrobe", (32, 56)), ("counter", (32, 44)), ("sink", (32, 48)), ("stove", (32, 44)),
    ("fridge", (44, 64)), ("microwave", (10, 28)), ("mixer", (10, 28)), ("coffee", (10, 32)),
    ("door", (44, 64)), ("window", (14, 40)), ("painting", (8, 24)), ("chalkboard", (16, 32)),
    ("toilet", (20, 32)), ("urinal", (18, 30)), ("vanity", (40, 60)), ("stall", (48, 64)),
    ("monitor", (16, 32)), ("rug", (0, 999)),
]

def upscaled(im):
    px = im.load(); W, H = im.size
    if W % 2 or H % 2 or W < 4: return False
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            c = px[x, y]
            if px[x + 1, y] != c or px[x, y + 1] != c or px[x + 1, y + 1] != c: return False
    return True

def main():
    props = json.load(open(os.path.join(ROOT, "art/props/props.json")))["props"]
    bad = 0
    print(f"{'prop':22} {'size':>9} {'h/char':>7}  range   result")
    for p in props:
        im = Image.open(os.path.join(ROOT, "art/props", p["file"])).convert("RGBA")
        rng = next((r for k, r in RANGES if k in p["name"]), None)
        issues = []
        if upscaled(im): issues.append("UPSCALED 2x")
        if rng and not (rng[0] <= im.height <= rng[1]): issues.append(f"SIZE (want {rng[0]}-{rng[1]})")
        if not rng: issues.append("no range")
        bad += bool(issues)
        r = f"{rng[0]}-{rng[1]}" if rng else "-"
        print(f"{p['name']:22} {im.width:>4}x{im.height:<4} {im.height / CHAR_H:>6.2f}x  {r:7} {'✓' if not issues else '✗ ' + ', '.join(issues)}")
    print(f"\n{len(props) - bad}/{len(props)} props pass")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
