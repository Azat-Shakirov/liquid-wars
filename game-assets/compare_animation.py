"""
Render an animation strip simulating what the in-game sandbox shows for each
walk-cycle variant. Composites bob (Y-shift), wobble (rotation), and the
per-variant transform (texture-swap for A/B, leg-shear for C) at 8 timesteps
spanning one full walk cycle (2 * WALK_FRAME_MS = 440ms).

This is the closest preview of the live animation we can produce without a
browser screenshot. Used to verify variant C's leg-shear direction matches
the Pixi skew before showing the user.

Output: /tmp/unit-variants-animation.png
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
VARIANTS = ROOT / "src" / "render" / "sprites" / "units" / "variants"
OUT = Path("/tmp/unit-variants-animation.png")

FACTION = "azure"

# Mirror the production / sandbox constants.
WALK_FRAME_MS = 220
BOB_AMPLITUDE = 1.6           # source-pixels at 1× scale
WOBBLE_AMPLITUDE = 0.05       # radians
VARIANT_C_SKEW = 0.10          # radians

# 4 representative timesteps: 0 (frame 0 rest), 110 (frame 0 peak),
# 220 (frame 1 rest), 330 (frame 1 peak). Catches both texture-swap states
# and both bob extremes without being too wide.
TIMESTEPS_MS = [0, 110, 220, 330]

# Render at 3× scale. Cell sizing constraint: the source sprite (79×96) at
# scale s with anchor at (0.5, 0.55) requires cell_h ≥ 96·s·(ANCHOR_Y + (1-0.78)).
# At s=3 and anchor_cell_y at 65% of cell height, cell_h=440 leaves ~40px of
# headroom above and below.
RENDER_SCALE = 3
ANCHOR_X = 0.5
ANCHOR_Y = 0.55
ANCHOR_CELL_Y_RATIO = 0.62

CELL_W = 280
CELL_H = 440
GAP = 14
HEADER_H = 36
ROW_H = CELL_H + 30  # cell + label
BG = (27, 31, 39, 255)
FG = (231, 233, 238, 255)


def load(rel: str) -> Image.Image:
    return Image.open(VARIANTS / rel).convert("RGBA")


def scale(img: Image.Image, factor: int) -> Image.Image:
    return img.resize((img.size[0] * factor, img.size[1] * factor), Image.NEAREST)


def bob_wobble(now_ms: float, sprite_scale: float) -> tuple[float, float]:
    phase = now_ms * math.pi / WALK_FRAME_MS
    return (
        -abs(math.sin(phase)) * BOB_AMPLITUDE * sprite_scale,
        math.sin(phase) * WOBBLE_AMPLITUDE,
    )


def frame_index(now_ms: float) -> int:
    return int(now_ms // WALK_FRAME_MS) & 1


def rotate_about(img: Image.Image, deg: float, cx: float, cy: float) -> Image.Image:
    """Rotate `img` about pixel (cx, cy). Output canvas grows to fit; the same
    pixel (cx, cy) stays in place. Returns (rotated_image, new_cx, new_cy).
    """
    # PIL's Image.rotate with center=(cx, cy) and expand=True does this for us.
    return img.rotate(-math.degrees(deg), resample=Image.BILINEAR, center=(cx, cy), expand=False)


def shear_about(img: Image.Image, skew_rad: float, cy: float) -> Image.Image:
    """Shear `img` horizontally about a horizontal line y=cy. Pixels above cy
    shift left, pixels below cy shift right (or vice versa) by tan(skew)*|y-cy|.
    Matches Pixi's `skew.x` semantics: positive shears the y-basis clockwise
    so the bottom of the sprite shifts right.
    """
    w, h = img.size
    sh = math.tan(skew_rad)
    # Output canvas wide enough to accommodate shear at top + bottom.
    max_shift = max(abs(sh * cy), abs(sh * (h - cy)))
    pad = int(math.ceil(max_shift)) + 1
    out_w = w + 2 * pad
    # AFFINE matrix maps OUTPUT (X, Y) → INPUT (a*X + b*Y + c, d*X + e*Y + f).
    # We want input_x = X - pad - sh * (Y - cy)  →  matrix = (1, -sh, -pad + sh*cy, 0, 1, 0).
    return img.transform(
        (out_w, h),
        Image.AFFINE,
        (1, -sh, -pad + sh * cy, 0, 1, 0),
        resample=Image.BILINEAR,
        fillcolor=(0, 0, 0, 0),
    ), pad


def render_variant_frame(kind: str, now_ms: float, sources: dict[str, Image.Image]) -> Image.Image:
    """Produce a CELL_W × CELL_H RGBA showing the variant at `now_ms`."""
    f = frame_index(now_ms)
    # Pick the texture(s) for this variant.
    if kind == "ref":
        tex = sources["a0"]
        legs_tex = None
    elif kind == "a":
        tex = sources["a0"] if f == 0 else sources["a1"]
        legs_tex = None
    elif kind == "b":
        tex = sources["b0"] if f == 0 else sources["b1"]
        legs_tex = None
    elif kind == "c":
        tex = sources["c_torso"]
        legs_tex = sources["c_legs"]
    else:
        raise ValueError(kind)

    tex_scaled = scale(tex, RENDER_SCALE)
    legs_scaled = scale(legs_tex, RENDER_SCALE) if legs_tex is not None else None
    sw, sh = tex_scaled.size
    sprite_scale = RENDER_SCALE  # we upscaled by this factor
    bob_y, wobble = bob_wobble(now_ms, sprite_scale)

    # Build the cell canvas. Position the sprite so the anchor sits at the cell's
    # ground-plane (~75% from top).
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    anchor_cell_x = CELL_W / 2
    anchor_cell_y = CELL_H * ANCHOR_CELL_Y_RATIO

    # --- LEGS LAYER (variant C only) -----------------------------------------
    # Shear about the cut line (which coincides with the sprite anchor at y=55%
    # of source). When mapped to scaled image, the anchor row is at sh*0.55.
    if legs_scaled is not None:
        sign = +1 if f == 0 else -1
        sheared, pad = shear_about(legs_scaled, sign * VARIANT_C_SKEW, sh * ANCHOR_Y)
        # Position sheared image so its anchor (originally at sw*0.5+pad in the
        # padded image, sh*0.55 vertically) lands on the cell's anchor point.
        legs_anchor_x = sw * ANCHOR_X + pad
        legs_anchor_y = sh * ANCHOR_Y
        # Legs do NOT bob — they stay grounded.
        paste_x = int(round(anchor_cell_x - legs_anchor_x))
        paste_y = int(round(anchor_cell_y - legs_anchor_y))
        cell.alpha_composite(sheared, (paste_x, paste_y))

    # --- TORSO / WHOLE-SPRITE LAYER ------------------------------------------
    # Apply rotation about the anchor first, then bob.
    main_anchor_x = sw * ANCHOR_X
    main_anchor_y = sh * ANCHOR_Y
    rotated = rotate_about(tex_scaled, wobble, main_anchor_x, main_anchor_y)
    paste_x = int(round(anchor_cell_x - main_anchor_x))
    paste_y = int(round(anchor_cell_y - main_anchor_y + bob_y))
    cell.alpha_composite(rotated, (paste_x, paste_y))
    return cell


def main() -> int:
    sources = {
        "a0": load(f"a/infantry-{FACTION}-0.png"),
        "a1": load(f"a/infantry-{FACTION}-1.png"),
        "b0": load(f"b/infantry-{FACTION}-0.png"),
        "b1": load(f"b/infantry-{FACTION}-1.png"),
        "c_torso": load(f"c/infantry-{FACTION}-torso.png"),
        "c_legs": load(f"c/infantry-{FACTION}-legs.png"),
    }

    variants = [
        ("REF (no swap)", "ref"),
        ("A · mirror legs", "a"),
        ("B · skew legs", "b"),
        ("C · split + shear", "c"),
    ]

    cols = len(TIMESTEPS_MS)
    rows = len(variants)
    canvas_w = GAP + cols * (CELL_W + GAP) + 100  # +100 for the variant-name gutter
    canvas_h = HEADER_H + rows * ROW_H + GAP
    canvas = Image.new("RGBA", (canvas_w, canvas_h), BG)
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
    except Exception:
        font = ImageFont.load_default()
        font_small = font

    # Column headers (timestamps).
    for c, t in enumerate(TIMESTEPS_MS):
        x = 100 + GAP + c * (CELL_W + GAP)
        draw.text((x + CELL_W / 2 - 18, 8), f"{t} ms", fill=FG, font=font_small)

    for r, (name, kind) in enumerate(variants):
        y = HEADER_H + r * ROW_H
        draw.text((8, y + CELL_H / 2 - 6), name, fill=FG, font=font)
        for c, t in enumerate(TIMESTEPS_MS):
            x = 100 + GAP + c * (CELL_W + GAP)
            cell = render_variant_frame(kind, t, sources)
            canvas.alpha_composite(cell, (x, y))

    canvas.save(OUT)
    print(f"wrote {OUT}  ({canvas.size[0]}×{canvas.size[1]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
