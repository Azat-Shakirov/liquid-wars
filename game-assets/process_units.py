"""
Unit sprite pipeline — single source, three variant strategies.

Bing can't generate two walk-cycle frames of the same character consistently
(face, armor, cape shape, lighting drift between generations). Instead we
take ONE source and derive frame 1 from frame 0 programmatically. Three
strategies are emitted side-by-side under src/render/sprites/units/variants/
so the author can pick which reads best at the in-game sandbox /?variants.

  A (mirror legs):  frame 0 = base, frame 1 = bottom strip h-mirrored.
                    Cut high enough to swing the legs but BELOW the sword
                    blade so the sword doesn't flip discontinuously.
  B (skew legs):    frame 0 = bottom strip skewed +SHEAR. frame 1 = -SHEAR.
                    Symmetric stride around the resting pose. Sword sways
                    naturally with the lean. Cut at the waist.
  C (split):        torso.png + legs.png as separate layers — renderer
                    composes them and animates legs independently. Cut at
                    the waist.

Pipeline per faction:
  1. rembg → transparent alpha
  2. cape mask (HSV blue band, hue 190–260, sat>0.35, val>0.20)
  3. recolor cape to faction hue (azure/crimson/verdant/amethyst/shadow)
  4. crop to opaque bbox, pad, downscale to 96px long edge → "base"
  5. apply per-variant transform → write PNG

Run via: ~/.venvs/rembg/bin/python game-assets/process_units.py
"""
import sys
import colorsys
from pathlib import Path
from PIL import Image
import numpy as np
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "game-assets"
SRC_NAME = "unit-infantry.jpeg"
OUT_DIR = ROOT / "src" / "render" / "sprites" / "units"
VARIANTS_DIR = OUT_DIR / "variants"

# Per-archetype chosen variant — used to copy the winning variant's frames to
# the production path (units/infantry-{faction}-{0,1}.png) so the game picks
# them up without any registry change. Picked via the /?variants sandbox.
CHOSEN_VARIANT = {
    "infantry": "b",
}

TARGET_LONG_EDGE = 96
MARGIN_RATIO = 0.04

# Faction → cape hue (degrees). Hues match v2.7.x liquid identities (cape
# color is the visual fingerprint of each faction) but the IDs are the v2.8.0
# heraldic-tincture names that the renderer + content JSONs use.
FACTION_HUES = {
    "azure": 210,    # ex-water
    "crimson": 0,    # ex-blood
    "verdant": 110,  # ex-slime
    "amethyst": 285, # ex-venom
}
SHADOW_FACTION = "shadow"  # ex-ink — special-cased desat + darken (no hue)

# Variant tuning. Cut ratios are measured from the top of the cropped figure.
# Each variant has its own optimal cut depending on what the transform does:
#  A: high cut would mirror the sword and create a discontinuous blade. Cut
#     below the sword tip so only boots flip. Stride read is subtle but clean.
#  B: skew is gentle enough that a higher cut works — the sword leans with
#     the legs which reads as a natural sword sway.
#  C: clean torso/legs split; renderer handles animation in-engine.
VARIANT_A_CUT = 0.78
VARIANT_B_CUT = 0.55
VARIANT_B_SHEAR = 0.14   # horizontal shear factor: bottom-of-strip shifts this × strip_height px
VARIANT_C_CUT = 0.55


def cape_mask(rgba: np.ndarray) -> np.ndarray:
    """Boolean mask of likely cape pixels using HSV thresholds."""
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    a = rgba[..., 3].astype(np.float32) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum.reduce([r, g, b])
    mn = np.minimum.reduce([r, g, b])
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    diff = np.maximum(mx - mn, 1e-6)
    h = np.zeros_like(mx)
    rmask = (mx == r) & (mx != mn)
    gmask = (mx == g) & (mx != mn)
    bmask = (mx == b) & (mx != mn)
    h[rmask] = (60.0 * ((g[rmask] - b[rmask]) / diff[rmask]) + 360.0) % 360.0
    h[gmask] = 60.0 * ((b[gmask] - r[gmask]) / diff[gmask]) + 120.0
    h[bmask] = 60.0 * ((r[bmask] - g[bmask]) / diff[bmask]) + 240.0
    is_cape = (h >= 190) & (h <= 260) & (s >= 0.35) & (v >= 0.20) & (a > 0.5)
    return is_cape


def recolor_to_hue(rgba: np.ndarray, mask: np.ndarray, target_hue_deg: float) -> np.ndarray:
    """Within mask, rotate hue to target while preserving saturation + value."""
    out = rgba.copy()
    if not mask.any():
        return out
    target_h = (target_hue_deg % 360) / 360.0
    pixels = rgba[mask].astype(np.float32) / 255.0
    for i in range(len(pixels)):
        r, g, b = pixels[i, 0], pixels[i, 1], pixels[i, 2]
        _, sat, val = colorsys.rgb_to_hsv(r, g, b)
        new_sat = min(1.0, sat * 1.05)
        nr, ng, nb = colorsys.hsv_to_rgb(target_h, new_sat, val)
        pixels[i, 0], pixels[i, 1], pixels[i, 2] = nr, ng, nb
    out[mask, :3] = np.clip(pixels[:, :3] * 255.0, 0, 255).astype(np.uint8)
    return out


def recolor_to_ink(rgba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Desaturate + darken the cape for the ink (black) faction."""
    out = rgba.copy()
    if not mask.any():
        return out
    pixels = rgba[mask].astype(np.float32) / 255.0
    for i in range(len(pixels)):
        r, g, b = pixels[i, 0], pixels[i, 1], pixels[i, 2]
        _, sat, val = colorsys.rgb_to_hsv(r, g, b)
        nr, ng, nb = colorsys.hsv_to_rgb(0.0, sat * 0.15, val * 0.35)
        pixels[i, 0], pixels[i, 1], pixels[i, 2] = nr, ng, nb
    out[mask, :3] = np.clip(pixels[:, :3] * 255.0, 0, 255).astype(np.uint8)
    return out


def base_finalize(rgba_arr: np.ndarray) -> Image.Image:
    """Crop to opaque bbox, pad, downscale. Returns the per-faction base image."""
    img = Image.fromarray(rgba_arr, mode="RGBA")
    bbox = img.getbbox()
    if bbox is None:
        raise RuntimeError("empty alpha after recolor")
    img = img.crop(bbox)
    w, h = img.size
    margin = max(1, int(MARGIN_RATIO * max(w, h)))
    padded = Image.new("RGBA", (w + 2 * margin, h + 2 * margin), (0, 0, 0, 0))
    padded.paste(img, (margin, margin), img)
    pw, ph = padded.size
    le = max(pw, ph)
    if le > TARGET_LONG_EDGE:
        s = TARGET_LONG_EDGE / le
        padded = padded.resize((max(1, int(pw * s)), max(1, int(ph * s))), Image.LANCZOS)
    return padded


def variant_a(base: Image.Image) -> tuple[Image.Image, Image.Image]:
    """A: mirror the legs strip horizontally for frame 1.

    Cut below the sword tip so the blade stays intact. Stride read = boots
    swap left/right around the strip's horizontal center.
    """
    w, h = base.size
    cut = int(h * VARIANT_A_CUT)
    bottom = base.crop((0, cut, w, h))
    bottom_mirrored = bottom.transpose(Image.FLIP_LEFT_RIGHT)
    frame0 = base.copy()
    frame1 = base.copy()
    # Clear the original bottom strip in frame 1, then composite the mirrored bottom.
    frame1.paste((0, 0, 0, 0), (0, cut, w, h))
    frame1.alpha_composite(bottom_mirrored, (0, cut))
    return frame0, frame1


def _skew_strip(strip: Image.Image, shear: float) -> tuple[Image.Image, int]:
    """Shear a strip horizontally: top of strip stays put, bottom shifts by shear*height.
    Returns (skewed_image, left_pad) — skewed_image is wider than input by 2*pad.
    """
    bw, bh = strip.size
    pad = int(abs(shear) * bh) + 2
    out_w = bw + 2 * pad
    out_h = bh
    # PIL AFFINE matrix (a,b,c,d,e,f) maps OUTPUT (x,y) → INPUT (x*a + y*b + c, x*d + y*e + f).
    # We want OUTPUT(x,y) to sample INPUT at (x - pad - shear*y, y) so the bottom of the
    # strip is sheared by `shear*bh` pixels relative to the top. Matrix = (1, -shear, -pad, 0, 1, 0).
    result = strip.transform(
        (out_w, out_h),
        Image.AFFINE,
        (1, -shear, -pad, 0, 1, 0),
        resample=Image.BILINEAR,
        fillcolor=(0, 0, 0, 0),
    )
    return result, pad


def variant_b(base: Image.Image) -> tuple[Image.Image, Image.Image]:
    """B: shear the legs strip ±SHEAR for symmetric stride frames.

    Frame 0 leans the bottom right; frame 1 leans the bottom left. Average
    pose ≈ rest pose. Sword sways with the strip naturally — reads as a
    sword swing in cadence with the step.
    """
    w, h = base.size
    cut = int(h * VARIANT_B_CUT)
    bottom = base.crop((0, cut, w, h))

    def compose(shear: float) -> Image.Image:
        skewed, pad = _skew_strip(bottom, shear)
        out = base.copy()
        out.paste((0, 0, 0, 0), (0, cut, w, h))
        out.alpha_composite(skewed, (-pad, cut))
        return out

    return compose(+VARIANT_B_SHEAR), compose(-VARIANT_B_SHEAR)


def variant_c(base: Image.Image) -> tuple[Image.Image, Image.Image]:
    """C: split base into torso (top) + legs (bottom), both padded to base size.

    Renderer composites both layers at the same anchor; leg animation is
    done in-engine (small x-offset + skew per frame). Returns (torso, legs).
    """
    w, h = base.size
    cut = int(h * VARIANT_C_CUT)
    torso = base.copy()
    legs = base.copy()
    torso.paste((0, 0, 0, 0), (0, cut, w, h))
    legs.paste((0, 0, 0, 0), (0, 0, w, cut))
    return torso, legs


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    rel = path.relative_to(ROOT)
    print(f"  -> {rel}  ({img.size[0]}x{img.size[1]})")


def faction_specs():
    """Yield (faction_name, recolor_fn) pairs."""
    for faction, hue in FACTION_HUES.items():
        # Default-arg trick to bind `hue` per iteration (avoids late-binding bug).
        yield faction, (lambda a, m, h=hue: recolor_to_hue(a, m, h))
    yield SHADOW_FACTION, (lambda a, m: recolor_to_ink(a, m))


def main() -> int:
    src_path = SRC_DIR / SRC_NAME
    if not src_path.exists():
        print(f"error: source not found at {src_path}", file=sys.stderr)
        return 1
    print(f"loading {SRC_NAME}")
    img = Image.open(src_path).convert("RGBA")
    session = new_session("u2net")
    cut = remove(img, session=session, post_process_mask=True)
    arr = np.array(cut)
    mask = cape_mask(arr)
    cape_pct = 100.0 * mask.sum() / max(1, mask.size)
    print(f"cape mask covers {cape_pct:.2f}% of pixels")

    archetype = "infantry"
    chosen = CHOSEN_VARIANT[archetype]

    for faction, recolor_fn in faction_specs():
        print(f"faction {faction}:")
        recolored = recolor_fn(arr, mask)
        base = base_finalize(recolored)

        a0, a1 = variant_a(base)
        save_png(a0, VARIANTS_DIR / "a" / f"{archetype}-{faction}-0.png")
        save_png(a1, VARIANTS_DIR / "a" / f"{archetype}-{faction}-1.png")

        b0, b1 = variant_b(base)
        save_png(b0, VARIANTS_DIR / "b" / f"{archetype}-{faction}-0.png")
        save_png(b1, VARIANTS_DIR / "b" / f"{archetype}-{faction}-1.png")

        c_torso, c_legs = variant_c(base)
        save_png(c_torso, VARIANTS_DIR / "c" / f"{archetype}-{faction}-torso.png")
        save_png(c_legs, VARIANTS_DIR / "c" / f"{archetype}-{faction}-legs.png")

        # Copy the chosen variant to the production path so the renderer picks
        # it up without any registry change. unitSprites.ts imports from here.
        if chosen == "a":
            save_png(a0, OUT_DIR / f"{archetype}-{faction}-0.png")
            save_png(a1, OUT_DIR / f"{archetype}-{faction}-1.png")
        elif chosen == "b":
            save_png(b0, OUT_DIR / f"{archetype}-{faction}-0.png")
            save_png(b1, OUT_DIR / f"{archetype}-{faction}-1.png")
        # Variant C ships as a split-layer pair, not a frame swap — when that
        # gets chosen, unitSprites.ts and UnitGroupView would need updating.

    print(f"done. production-path uses variant {chosen.upper()} for {archetype}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
