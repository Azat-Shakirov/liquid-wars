"""
Unit sprite pipeline — single source per archetype, three variant strategies.

v2.8.7: extended from infantry-only to all five archetypes. Each archetype
declares its own source filename, target sprite size, and chosen variant.
The cape-mask + faction-recolor + crop/pad/downscale flow is shared.

Frame 1 derivation strategies (kept from v2.8.6):
  A (mirror legs):  cut high (below sword); paste h-flipped bottom strip.
  B (skew legs):    cut at the waist; shear bottom strip ±SHEAR for
                    symmetric stride frames. Default for v2.8.7 archetypes.
  C (split):        torso.png + legs.png as separate layers; renderer
                    composes + shears in-engine. Not yet supported at the
                    production path — VariantSandbox-only.

Per archetype:
  1. rembg → transparent alpha
  2. cape mask (HSV blue band)
  3. recolor cape to faction hue (azure/crimson/verdant/amethyst) or to
     near-black for shadow
  4. crop to opaque bbox, pad, downscale to per-archetype TARGET_LONG_EDGE
  5. apply per-archetype CHOSEN_VARIANT transform → write PNGs

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
OUT_DIR = ROOT / "src" / "render" / "sprites" / "units"
VARIANTS_DIR = OUT_DIR / "variants"

# Per-archetype config.
#
#   src          = source JPEG filename in game-assets/
#   target_le    = downscaled longest edge in px (cavalry larger because
#                  the horse + rider is wider than tall — keeping long-edge
#                  parity with foot units would leave cavalry visually
#                  smaller than infantry on the field)
#   variant      = which variant copies to the production path
#   cut_b        = per-archetype waist-cut ratio for variant B. Foot units
#                  cut at 0.55 (legs swing). Cavalry cuts at 0.70 so the
#                  shear acts on the horse's lower body + hooves, not on
#                  the rider's torso (rider should stay stable).
ARCHETYPES = {
    "infantry": {
        "src": "infantry.jpeg",
        "target_le": 96,
        "variant": "b",
        "cut_b": 0.55,
    },
    "knight": {
        "src": "knight.jpeg",
        "target_le": 96,
        "variant": "b",
        "cut_b": 0.55,
    },
    "archer": {
        "src": "archer.jpeg",
        "target_le": 96,
        "variant": "b",
        "cut_b": 0.55,
    },
    "mage": {
        "src": "mage.jpeg",
        "target_le": 96,
        "variant": "b",
        "cut_b": 0.55,
    },
    "cavalry": {
        # Two sources exist (cavalry.jpeg + cavalry-1.jpeg). cavalry-1.jpeg
        # picked because its dynamic charge-forward pose reads as "moving"
        # in a way the rear-facing cavalry.jpeg (lance-aloft) doesn't. The
        # two sources are different viewing angles, not a valid 2-frame
        # pair, so we still derive frame 1 via the variant pipeline.
        "src": "cavalry-1.jpeg",
        "target_le": 128,
        "variant": "b",
        "cut_b": 0.70,
    },
}

MARGIN_RATIO = 0.04

# Faction → cape hue (degrees). Same heraldic-tincture mapping the rest of
# the renderer + content JSONs use. SHADOW is special-cased to desaturate +
# darken (no hue), matching the v2.7.x ink look.
FACTION_HUES = {
    "azure": 210,
    "crimson": 0,
    "verdant": 110,
    "amethyst": 285,
}
SHADOW_FACTION = "shadow"

# Variant tuning.
VARIANT_A_CUT = 0.78
VARIANT_B_SHEAR = 0.14
VARIANT_C_CUT = 0.55


def cape_mask(rgba: np.ndarray) -> np.ndarray:
    """Boolean mask of likely cape/banner pixels using HSV thresholds.

    The blue band 190..260° covers azure, navy, royal blue, blue-violet —
    all the tones the Bing prompts ask for. Lowering `val` to 0.15 lets the
    darker mage robe register (mage source averages val ~ 0.3 — earlier
    0.20 threshold occasionally clipped the deepest folds).
    """
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
    is_cape = (h >= 190) & (h <= 260) & (s >= 0.35) & (v >= 0.15) & (a > 0.5)
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
    """Desaturate + darken the cape for the shadow (black-banner) faction."""
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


def base_finalize(rgba_arr: np.ndarray, target_le: int) -> Image.Image:
    """Crop to opaque bbox, pad, downscale to target longest edge."""
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
    if le > target_le:
        s = target_le / le
        padded = padded.resize((max(1, int(pw * s)), max(1, int(ph * s))), Image.LANCZOS)
    return padded


def variant_a(base: Image.Image) -> tuple[Image.Image, Image.Image]:
    w, h = base.size
    cut = int(h * VARIANT_A_CUT)
    bottom = base.crop((0, cut, w, h))
    bottom_mirrored = bottom.transpose(Image.FLIP_LEFT_RIGHT)
    frame0 = base.copy()
    frame1 = base.copy()
    frame1.paste((0, 0, 0, 0), (0, cut, w, h))
    frame1.alpha_composite(bottom_mirrored, (0, cut))
    return frame0, frame1


def _skew_strip(strip: Image.Image, shear: float) -> tuple[Image.Image, int]:
    bw, bh = strip.size
    pad = int(abs(shear) * bh) + 2
    out_w = bw + 2 * pad
    out_h = bh
    result = strip.transform(
        (out_w, out_h),
        Image.AFFINE,
        (1, -shear, -pad, 0, 1, 0),
        resample=Image.BILINEAR,
        fillcolor=(0, 0, 0, 0),
    )
    return result, pad


def variant_b(base: Image.Image, cut_ratio: float) -> tuple[Image.Image, Image.Image]:
    w, h = base.size
    cut = int(h * cut_ratio)
    bottom = base.crop((0, cut, w, h))

    def compose(shear: float) -> Image.Image:
        skewed, pad = _skew_strip(bottom, shear)
        out = base.copy()
        out.paste((0, 0, 0, 0), (0, cut, w, h))
        out.alpha_composite(skewed, (-pad, cut))
        return out

    return compose(+VARIANT_B_SHEAR), compose(-VARIANT_B_SHEAR)


def variant_c(base: Image.Image) -> tuple[Image.Image, Image.Image]:
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
        yield faction, (lambda a, m, h=hue: recolor_to_hue(a, m, h))
    yield SHADOW_FACTION, (lambda a, m: recolor_to_ink(a, m))


def process_archetype(archetype: str, cfg: dict, session) -> None:
    src_path = SRC_DIR / cfg["src"]
    if not src_path.exists():
        print(f"  warn: source not found at {src_path}, skipping {archetype}", file=sys.stderr)
        return
    print(f"\n=== {archetype} (src={cfg['src']}, target_le={cfg['target_le']}, variant={cfg['variant'].upper()}) ===")
    img = Image.open(src_path).convert("RGBA")
    cut = remove(img, session=session, post_process_mask=True)
    arr = np.array(cut)
    mask = cape_mask(arr)
    cape_pct = 100.0 * mask.sum() / max(1, mask.size)
    print(f"  cape mask covers {cape_pct:.2f}% of pixels")

    target_le = cfg["target_le"]
    cut_b = cfg["cut_b"]
    chosen = cfg["variant"]

    for faction, recolor_fn in faction_specs():
        print(f"  faction {faction}:")
        recolored = recolor_fn(arr, mask)
        base = base_finalize(recolored, target_le)

        a0, a1 = variant_a(base)
        save_png(a0, VARIANTS_DIR / "a" / f"{archetype}-{faction}-0.png")
        save_png(a1, VARIANTS_DIR / "a" / f"{archetype}-{faction}-1.png")

        b0, b1 = variant_b(base, cut_b)
        save_png(b0, VARIANTS_DIR / "b" / f"{archetype}-{faction}-0.png")
        save_png(b1, VARIANTS_DIR / "b" / f"{archetype}-{faction}-1.png")

        c_torso, c_legs = variant_c(base)
        save_png(c_torso, VARIANTS_DIR / "c" / f"{archetype}-{faction}-torso.png")
        save_png(c_legs, VARIANTS_DIR / "c" / f"{archetype}-{faction}-legs.png")

        if chosen == "a":
            save_png(a0, OUT_DIR / f"{archetype}-{faction}-0.png")
            save_png(a1, OUT_DIR / f"{archetype}-{faction}-1.png")
        elif chosen == "b":
            save_png(b0, OUT_DIR / f"{archetype}-{faction}-0.png")
            save_png(b1, OUT_DIR / f"{archetype}-{faction}-1.png")
        # variant C requires renderer changes (split-layer); ships only to
        # the variants/c/ sandbox path, not to production, until that work
        # is done.


def main() -> int:
    session = new_session("u2net")
    for archetype, cfg in ARCHETYPES.items():
        process_archetype(archetype, cfg, session)
    print("\ndone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
