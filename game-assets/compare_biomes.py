"""
Render all five biomes side-by-side with sample nodes overlaid.

Each biome is shown stretched to a representative level aspect (1.5:1,
matching ~1200x800 sandbox dims) and seeded with one of each node type
in a couple of factions, so we can eyeball style cohesion between the
biome floor and the painterly node sprites without spinning up the
browser.

Run via: ~/.venvs/rembg/bin/python game-assets/compare_biomes.py
Output: /tmp/biome-comparison.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BIOMES_DIR = ROOT / "src" / "render" / "sprites" / "biomes"
NODES_DIR = ROOT / "src" / "render" / "sprites" / "nodes"
OUT = Path("/tmp/biome-comparison.png")

PANEL_W, PANEL_H = 900, 600          # one biome panel
GAP = 24                             # space between panels
LABEL_H = 44                         # top label band per panel
NODE_TARGET = 100                    # node sprite display longest edge

BIOMES = ["grass", "desert", "snow", "jungle", "ruins"]

# Five sample nodes, scattered around the panel — one of each node type
# and a couple of factions to show how factions sit against each biome.
NODE_PLACEMENTS = [
    ("tower-azure.png",    (140, 130)),
    ("barracks-crimson.png", (520, 130)),
    ("house-verdant.png",  (140, 380)),
    ("lab-amethyst.png",   (480, 380)),
    ("tower-shadow.png",   (760, 280)),
]


def load_node(name: str) -> Image.Image:
    img = Image.open(NODES_DIR / name).convert("RGBA")
    w, h = img.size
    s = NODE_TARGET / max(w, h)
    return img.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)


def build_panel(biome_id: str, font) -> Image.Image:
    bg = Image.open(BIOMES_DIR / f"{biome_id}-bg.png").convert("RGBA")
    # Mirror the in-game renderer: bg is *stretched* to fill the panel.
    bg = bg.resize((PANEL_W, PANEL_H), Image.LANCZOS)
    # alpha 0.92 to mirror PixiRenderer.syncBiome
    bg.putalpha(int(0.92 * 255))
    canvas = Image.new("RGBA", (PANEL_W, PANEL_H + LABEL_H), (10, 10, 10, 255))
    canvas.alpha_composite(bg, (0, LABEL_H))

    for name, (x, y) in NODE_PLACEMENTS:
        node = load_node(name)
        nw, nh = node.size
        canvas.alpha_composite(node, (x - nw // 2, y - nh // 2 + LABEL_H))

    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, PANEL_W, LABEL_H), fill=(20, 20, 24, 255))
    draw.text((16, 10), f"BIOME: {biome_id}", fill=(230, 230, 230), font=font)
    return canvas


def main() -> int:
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception:
        font = ImageFont.load_default()

    panels = [build_panel(b, font) for b in BIOMES]
    panel_h = PANEL_H + LABEL_H
    total_h = panel_h * len(panels) + GAP * (len(panels) - 1)
    out = Image.new("RGBA", (PANEL_W, total_h), (0, 0, 0, 255))
    y = 0
    for p in panels:
        out.alpha_composite(p, (0, y))
        y += panel_h + GAP
    out.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT}  ({out.size[0]}x{out.size[1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
