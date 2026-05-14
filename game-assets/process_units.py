"""
Strip JPEG background from an infantry source image, then generate 5 per-liquid
variants by recoloring the cape from blue to each faction's hue.

The source images both show a soldier with a vivid blue cape. We:
  1. rembg → transparent alpha
  2. Detect cape pixels: HSV blue band (hue ~190–260, sat > 0.35, val > 0.20)
     to avoid catching the silver helmet (low saturation) or the brown belt.
  3. Convert those pixels' HUE to the target liquid's hue, preserving each
     pixel's saturation and value so cape folds + shading survive intact.
  4. Ink (black) is special-cased: desaturate cape and crush value to 25%.
  5. Crop to opaque bbox, pad, downscale to 96px long edge, write PNG.

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
# Two walk-cycle frames. Output suffixes -0 / -1 are used as a 2-frame
# animation in UnitGroupView.
FRAMES = [
    ("unit-infantry.jpeg", 0),
    ("unit-infantry-1.jpeg", 1),
]
OUT_DIR = ROOT / "src" / "render" / "sprites" / "units"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_LONG_EDGE = 96
MARGIN_RATIO = 0.04

# Target hue (deg) per liquid. Original cape hue is roughly 210° (royal blue).
LIQUID_HUES = {
    "water": 210,
    "blood": 0,
    "slime": 110,
    "venom": 285,
}
# Ink uses a special low-saturation, low-value treatment instead of a hue.
INK_LIQUID = "ink"


def cape_mask(rgba: np.ndarray) -> np.ndarray:
    """Boolean mask of likely cape pixels using HSV thresholds."""
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    a = rgba[..., 3].astype(np.float32) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum.reduce([r, g, b])
    mn = np.minimum.reduce([r, g, b])
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    # hue in degrees (vectorized)
    diff = np.maximum(mx - mn, 1e-6)
    h = np.zeros_like(mx)
    rmask = (mx == r) & (mx != mn)
    gmask = (mx == g) & (mx != mn)
    bmask = (mx == b) & (mx != mn)
    h[rmask] = (60.0 * ((g[rmask] - b[rmask]) / diff[rmask]) + 360.0) % 360.0
    h[gmask] = 60.0 * ((b[gmask] - r[gmask]) / diff[gmask]) + 120.0
    h[bmask] = 60.0 * ((r[bmask] - g[bmask]) / diff[bmask]) + 240.0
    # Blue cape band
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
        # Pump saturation a touch so the new hue reads clearly (the blue
        # was ~0.6 sat in the source; flat-rotate to red ends up muddy).
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


def finalize(rgba_arr: np.ndarray, dst: Path) -> None:
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
    padded.save(dst, format="PNG", optimize=True)
    print(f"  -> {dst.relative_to(ROOT)}  ({padded.size[0]}x{padded.size[1]})")


def main() -> int:
    session = new_session("u2net")
    for src_name, frame_idx in FRAMES:
        src_path = SRC_DIR / src_name
        print(f"frame {frame_idx}: loading {src_name}")
        img = Image.open(src_path).convert("RGBA")
        cut = remove(img, session=session, post_process_mask=True)
        arr = np.array(cut)
        mask = cape_mask(arr)
        cape_pct = 100.0 * mask.sum() / max(1, mask.size)
        print(f"  cape mask covers {cape_pct:.2f}% of pixels")
        for liquid, hue in LIQUID_HUES.items():
            recolored = recolor_to_hue(arr, mask, hue)
            finalize(recolored, OUT_DIR / f"infantry-{liquid}-{frame_idx}.png")
        finalize(recolor_to_ink(arr, mask), OUT_DIR / f"infantry-{INK_LIQUID}-{frame_idx}.png")
    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
