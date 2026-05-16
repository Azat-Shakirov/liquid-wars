"""
Build a side-by-side comparison PNG of all unit-walk variants for visual
inspection. Used after process_units.py to verify cut lines / skew amounts
before exposing in the in-game sandbox.

For each variant column, we render frame 0 and frame 1 stacked. For variant C,
we also render the in-engine animation simulation: torso composed with legs at
two skewed positions (since C's "frames" come from runtime composition).

Output: /tmp/unit-variants-compare.png (4× scaled for legibility).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
VARIANTS = ROOT / "src" / "render" / "sprites" / "units" / "variants"
OUT = Path("/tmp/unit-variants-compare.png")

FACTION = "azure"  # most representative cape color (matches the source's blue)
TILE = 96
SCALE = 4
CELL = TILE * SCALE
GAP = 12
LABEL_H = 22
HEADER_H = 28
BG = (40, 44, 52, 255)
LABEL_FG = (220, 220, 220, 255)
HEADER_FG = (250, 220, 130, 255)


def load(rel: str) -> Image.Image:
    p = VARIANTS / rel
    img = Image.open(p).convert("RGBA")
    return img


def upscale(img: Image.Image) -> Image.Image:
    return img.resize((img.size[0] * SCALE, img.size[1] * SCALE), Image.NEAREST)


def render_c_legs_anim(torso: Image.Image, legs: Image.Image, shear: float, dx: int) -> Image.Image:
    """Simulate the in-engine C-variant animation: torso + skewed/offset legs."""
    w, h = torso.size
    out = torso.copy()
    if shear == 0 and dx == 0:
        out.alpha_composite(legs)
        return out
    # Shear legs about their TOP edge (so the hip line stays glued to the torso).
    pad = int(abs(shear) * h) + 2
    transformed = legs.transform(
        (w + 2 * pad, h),
        Image.AFFINE,
        (1, -shear, -pad - dx, 0, 1, 0),
        resample=Image.BILINEAR,
        fillcolor=(0, 0, 0, 0),
    )
    out.alpha_composite(transformed, (-pad, 0))
    return out


def main() -> int:
    # Load all sources.
    a0 = load(f"a/infantry-{FACTION}-0.png")
    a1 = load(f"a/infantry-{FACTION}-1.png")
    b0 = load(f"b/infantry-{FACTION}-0.png")
    b1 = load(f"b/infantry-{FACTION}-1.png")
    c_torso = load(f"c/infantry-{FACTION}-torso.png")
    c_legs = load(f"c/infantry-{FACTION}-legs.png")

    # Compose C's two "frames" with in-engine-style transforms applied to legs.
    c0 = render_c_legs_anim(c_torso, c_legs, +0.12, +1)
    c1 = render_c_legs_anim(c_torso, c_legs, -0.12, -1)

    # Build the canvas: 4 columns × 2 rows, with header + per-cell label.
    columns = [
        ("REF (frame 0 only)", [a0, a0]),
        ("A: mirror legs (cut 0.78)", [a0, a1]),
        ("B: skew legs ±SHEAR (cut 0.55)", [b0, b1]),
        ("C: split + in-engine anim (cut 0.55)", [c0, c1]),
    ]
    ncols = len(columns)
    nrows = 2
    canvas_w = ncols * CELL + (ncols + 1) * GAP
    canvas_h = HEADER_H + nrows * (CELL + LABEL_H) + (nrows + 1) * GAP
    canvas = Image.new("RGBA", (canvas_w, canvas_h), BG)
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        font = ImageFont.load_default()
        font_small = font

    for col, (title, frames) in enumerate(columns):
        x = GAP + col * (CELL + GAP)
        draw.text((x, 6), title, fill=HEADER_FG, font=font)
        for row, frame in enumerate(frames):
            y = HEADER_H + GAP + row * (CELL + LABEL_H + GAP)
            scaled = upscale(frame)
            canvas.alpha_composite(scaled, (x, y))
            label = "frame 0" if row == 0 else "frame 1"
            draw.text((x + 4, y + CELL + 4), label, fill=LABEL_FG, font=font_small)

    canvas.save(OUT)
    print(f"wrote {OUT}  ({canvas.size[0]}×{canvas.size[1]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
