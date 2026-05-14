"""
Strip JPEG backgrounds with rembg, autocrop to opaque bbox, pad with a small
transparent margin, downscale to 256px on the long edge, and write PNGs into
src/render/sprites/nodes/.

Run via: ~/.venvs/rembg/bin/python game-assets/process_sprites.py
"""
import sys
from pathlib import Path
from PIL import Image
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "game-assets"
OUT_DIR = ROOT / "src" / "render" / "sprites" / "nodes"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TOWERS = [
    ("tower-blue.jpeg", "tower-water.png"),
    ("tower-red.jpeg", "tower-blood.png"),
    ("tower-green.jpeg", "tower-slime.png"),
    ("tower-purple.jpeg", "tower-venom.png"),
    ("tower-black.jpeg", "tower-ink.png"),
]

TARGET_LONG_EDGE = 256
MARGIN_RATIO = 0.04  # transparent padding so antialiased edges aren't clipped

session = new_session("u2net")  # general-purpose; good on illustrated subjects


def process(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    cut = remove(img, session=session, post_process_mask=True)
    bbox = cut.getbbox()
    if bbox is None:
        raise RuntimeError(f"rembg returned empty alpha for {src.name}")
    cropped = cut.crop(bbox)

    w, h = cropped.size
    margin = max(1, int(MARGIN_RATIO * max(w, h)))
    padded = Image.new("RGBA", (w + 2 * margin, h + 2 * margin), (0, 0, 0, 0))
    padded.paste(cropped, (margin, margin), cropped)

    pw, ph = padded.size
    long_edge = max(pw, ph)
    if long_edge > TARGET_LONG_EDGE:
        scale = TARGET_LONG_EDGE / long_edge
        new_size = (max(1, int(pw * scale)), max(1, int(ph * scale)))
        padded = padded.resize(new_size, Image.LANCZOS)

    padded.save(dst, format="PNG", optimize=True)
    print(f"  {src.name} -> {dst.relative_to(ROOT)}  ({padded.size[0]}x{padded.size[1]})")


def main() -> int:
    print(f"processing {len(TOWERS)} tower images...")
    for src_name, dst_name in TOWERS:
        process(SRC_DIR / src_name, OUT_DIR / dst_name)
    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
