"""
Process biome floor images into PNGs ready for PixiJS TilingSprite.

Sources are 1024×1024 painterly biome tiles. Two flavors:
  - FULL-FRAME (e.g. dunes.jpeg): content fills the canvas edge-to-edge.
    Just save as PNG; can be stretched or tiled. (Won't be perfectly
    seamless at edges but artistic enough for a strategy map floor.)
  - DIAMOND-FRAMED (e.g. grass.jpeg): content drawn as an isometric
    diamond with dark slate around it. Color-key removes the slate,
    leaving a diamond-shape PNG with transparent corners. NOT a true
    tileable floor — flagged for the user to regenerate.

Output: src/render/sprites/biomes/<biome>-bg.png

Run via: ~/.venvs/rembg/bin/python game-assets/process_biomes.py
"""
import sys
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "game-assets"
OUT_DIR = ROOT / "src" / "render" / "sprites" / "biomes"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SOURCES = [
    # (source filename, biome id, strategy)
    # v2.8.7: dunes.jpeg (photographic) retired; replaced with painterly
    # desert.jpeg. snow / jungle / ruins added — all painterly full-frame.
    # For jungle, two sources were generated (jungle.jpeg + jungle-1.jpeg);
    # jungle-1 picked because it tiles more evenly (jungle.jpeg has a
    # compositional center hole that betrays edges when tiled).
    ("desert.jpeg",     "desert", "full"),
    # v2.8.3: replaced grass.jpeg (colorkey diamond, never tileable)
    # with test-grass.jpeg — a painterly edge-to-edge source that
    # matches the building/unit illustration style. Saved full-frame.
    ("test-grass.jpeg", "grass",  "full"),
    ("snow.jpeg",       "snow",   "full"),
    ("jungle-1.jpeg",   "jungle", "full"),
    ("ruins.jpeg",      "ruins",  "full"),
]

# Distance from sampled corner-background to treat as transparent.
COLORKEY_THRESHOLD = 60


def colorkey_remove(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    h, w = arr.shape[:2]
    corners = np.stack([arr[0, 0, :3], arr[0, w - 1, :3], arr[h - 1, 0, :3], arr[h - 1, w - 1, :3]])
    bg = corners.mean(axis=0)
    diff = arr[..., :3].astype(np.float32) - bg
    dist = np.sqrt((diff ** 2).sum(axis=-1))
    is_bg = dist < COLORKEY_THRESHOLD
    out = arr.copy()
    out[is_bg, 3] = 0
    return Image.fromarray(out, mode="RGBA")


def main() -> int:
    for src_name, biome_id, strategy in SOURCES:
        src = SRC_DIR / src_name
        print(f"{biome_id}: loading {src_name} (strategy={strategy})")
        img = Image.open(src).convert("RGBA")
        if strategy == "colorkey":
            img = colorkey_remove(img)
        dst = OUT_DIR / f"{biome_id}-bg.png"
        img.save(dst, format="PNG", optimize=True)
        print(f"  -> {dst.relative_to(ROOT)}  ({img.size[0]}x{img.size[1]})")
    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
