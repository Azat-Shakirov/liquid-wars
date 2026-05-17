"""
Process the 3 non-tower node source images (house-blue / barracks-blue /
lab-blue), strip their dark slate backgrounds with rembg, then recolor
the BLUE elements (flag / banner / dome / window glow) to each faction's
hue. Output: 15 PNGs total (3 types × 5 factions).

Mirrors game-assets/process_units.py but targets 256px (long edge) for
node sprites vs 96px for units, and uses a slightly wider HSV value
range to catch the lab dome's deeper shadow regions.

Run via: ~/.venvs/rembg/bin/python game-assets/process_nodes.py
"""
import sys
import colorsys
from pathlib import Path
from PIL import Image
import numpy as np
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "game-assets"
OUT_DIR = ROOT / "src" / "render" / "sprites" / "nodes"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SOURCES = [
    # (source filename, node-type id, background-removal strategy)
    # 'u2net' rembg model works on hard-edged subjects (barracks, lab).
    # 'colorkey' is a deterministic dark-slate threshold for sources that
    # confuse the AI model (house: warm yellow ground halo gets eaten by
    # rembg/isnet both, leaving the walls in pieces).
    ("house-blue.jpeg", "house", "u2net"),
    ("barracks-blue.jpeg", "barracks", "u2net"),
    ("lab-blue.jpeg", "lab", "u2net"),
]

# Color-key knockout: pixels within this RGB distance of the sampled
# corner-background are made transparent. ~50 hits the dark slate
# (#2a2a2e) without erasing dark shadow areas of the building.
COLORKEY_THRESHOLD = 55

TARGET_LONG_EDGE = 256
MARGIN_RATIO = 0.03

LIQUID_HUES = {
    "azure": 210,
    "crimson": 0,
    "verdant": 110,
    "amethyst": 285,
}
INK_FACTION = "shadow"
NEUTRAL_FACTION = "neutral"


def blue_mask(rgba: np.ndarray) -> np.ndarray:
    """Boolean mask of likely blue-element pixels (flag/banner/dome/glow)."""
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
    # Blue elements band. Slightly wider value range than units (0.10 vs
    # 0.20) so the lab dome's shadow regions get recolored too.
    return (h >= 190) & (h <= 260) & (s >= 0.35) & (v >= 0.10) & (a > 0.5)


def recolor_to_hue(rgba: np.ndarray, mask: np.ndarray, target_hue_deg: float) -> np.ndarray:
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


def recolor_to_shadow(rgba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    if not mask.any():
        return out
    pixels = rgba[mask].astype(np.float32) / 255.0
    for i in range(len(pixels)):
        r, g, b = pixels[i, 0], pixels[i, 1], pixels[i, 2]
        _, sat, val = colorsys.rgb_to_hsv(r, g, b)
        nr, ng, nb = colorsys.hsv_to_rgb(0.0, sat * 0.15, val * 0.40)
        pixels[i, 0], pixels[i, 1], pixels[i, 2] = nr, ng, nb
    out[mask, :3] = np.clip(pixels[:, :3] * 255.0, 0, 255).astype(np.uint8)
    return out


def recolor_to_neutral(rgba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Desaturate the team-color elements to a stone-grey tone.

    Stronger desat than shadow (sat * 0.0 vs shadow's 0.15) and value
    nudged toward mid-grey (val * 0.75 + 0.15) so the result lands at
    a readable medium grey on any biome floor, neither too dark (would
    confuse with shadow) nor too bright (would clash with snow).
    """
    out = rgba.copy()
    if not mask.any():
        return out
    pixels = rgba[mask].astype(np.float32) / 255.0
    for i in range(len(pixels)):
        r, g, b = pixels[i, 0], pixels[i, 1], pixels[i, 2]
        _, sat, val = colorsys.rgb_to_hsv(r, g, b)
        target_val = val * 0.75 + 0.15
        nr, ng, nb = colorsys.hsv_to_rgb(0.0, 0.0, target_val)
        pixels[i, 0], pixels[i, 1], pixels[i, 2] = nr, ng, nb
    out[mask, :3] = np.clip(pixels[:, :3] * 255.0, 0, 255).astype(np.uint8)
    return out


def make_neutral_tower_from_source(src_jpeg: Path, dst: Path, sessions: dict) -> None:
    """Generate tower-neutral.png from tower-blue.jpeg by isolating the
    blue elements (roof dome, banner, window glow) via the same HSV mask
    used for house/barracks/lab, then desaturating ONLY those pixels to
    grey. Stone walls + base + door retain their original warm-tan color.

    Without this, a full-image desaturate would also grey out the stone
    walls — losing the "castle masonry under a faction roof" visual that
    the colored tower variants share.
    """
    img = Image.open(src_jpeg).convert("RGBA")
    if "u2net" not in sessions:
        sessions["u2net"] = new_session("u2net")
    cut = remove(img, session=sessions["u2net"], post_process_mask=True)
    arr = np.array(cut)
    mask = blue_mask(arr)
    pct = 100.0 * mask.sum() / max(1, mask.size)
    print(f"  tower-blue blue mask covers {pct:.2f}% of pixels")
    recolored = recolor_to_neutral(arr, mask)
    finalize(recolored, dst)


def colorkey_remove(img: Image.Image) -> Image.Image:
    """Knock out the dark-slate background by sampling a corner pixel
    and making everything within COLORKEY_THRESHOLD transparent. Includes
    a small dilate-shrink pass to remove single-pixel halos along edges."""
    arr = np.array(img.convert("RGBA"))
    h, w = arr.shape[:2]
    # Average the four corners as the background reference.
    corners = np.stack([arr[0, 0, :3], arr[0, w - 1, :3], arr[h - 1, 0, :3], arr[h - 1, w - 1, :3]])
    bg = corners.mean(axis=0)
    diff = arr[..., :3].astype(np.float32) - bg
    dist = np.sqrt((diff ** 2).sum(axis=-1))
    is_bg = dist < COLORKEY_THRESHOLD
    out = arr.copy()
    out[is_bg, 3] = 0
    return Image.fromarray(out, mode="RGBA")


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
    sessions: dict[str, object] = {}
    for src_name, node_type, strategy in SOURCES:
        src_path = SRC_DIR / src_name
        print(f"{node_type}: loading {src_name} (strategy={strategy})")
        img = Image.open(src_path).convert("RGBA")
        if strategy == "colorkey":
            cut = colorkey_remove(img)
        else:
            if strategy not in sessions:
                print(f"  loading rembg model: {strategy}")
                sessions[strategy] = new_session(strategy)
            cut = remove(img, session=sessions[strategy], post_process_mask=True)
        arr = np.array(cut)
        mask = blue_mask(arr)
        pct = 100.0 * mask.sum() / max(1, mask.size)
        print(f"  blue mask covers {pct:.2f}% of pixels")
        for faction, hue in LIQUID_HUES.items():
            recolored = recolor_to_hue(arr, mask, hue)
            finalize(recolored, OUT_DIR / f"{node_type}-{faction}.png")
        finalize(recolor_to_shadow(arr, mask), OUT_DIR / f"{node_type}-{INK_FACTION}.png")
        finalize(recolor_to_neutral(arr, mask), OUT_DIR / f"{node_type}-{NEUTRAL_FACTION}.png")

    # Tower neutral: isolate the blue elements on tower-blue.jpeg (roof
    # dome, banner, window glow) and desaturate ONLY those, leaving the
    # stone walls + base intact. Reuses the same HSV blue mask the other
    # node types use.
    print("tower: blue-mask recolor on tower-blue.jpeg → tower-neutral.png")
    make_neutral_tower_from_source(
        SRC_DIR / "tower-blue.jpeg",
        OUT_DIR / "tower-neutral.png",
        sessions,
    )

    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
