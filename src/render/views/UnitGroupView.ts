// UnitGroupView — renders one in-flight UnitGroup as an infantry sprite
// (v2.7.8) whose cape color tracks the source liquid. Pre-v2.7.8 was a
// procedural colored droplet; kept as a fallback when the texture isn't
// loaded yet (very brief, only at first frame after PixiRenderer.create).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { UnitGroup } from '../../engine/entities/UnitGroup';
import type { ContentLibrary } from '../../engine/content/ContentLibrary';
import type { World } from '../../engine/World';
import { colorFromHex } from '../shapes';
import { getUnitTexture } from '../sprites/unitSprites';

// Display size of the infantry sprite at world.visualScale = 1. Adjusted so
// the soldier reads comparably to the procedural droplet's footprint
// (~14–28 px diameter depending on count).
const SPRITE_BASE_DISPLAY_HEIGHT = 26;
// Size grows with sqrt(count) so a stack-of-50 looks meaningfully bigger
// than a stack-of-1 without scaling unboundedly. Caps at 1.5×.
function countScale(count: number): number {
  const c = Math.max(1, count);
  return Math.min(1.5, 0.85 + Math.sqrt(c) * 0.06);
}

export class UnitGroupView {
  readonly container: Container;
  private readonly droplet: Graphics;
  private readonly sprite: Sprite;
  private readonly label: Text;
  private readonly groupId: string;

  constructor(ug: UnitGroup) {
    this.groupId = ug.id;
    this.container = new Container();
    this.droplet = new Graphics();
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 0.55);
    this.sprite.visible = false;
    this.label = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fill: 0xffffff,
        fontWeight: '600',
      },
    });
    this.label.anchor.set(0.5, -1.0);
    this.container.addChild(this.droplet);
    this.container.addChild(this.sprite);
    this.container.addChild(this.label);
  }

  update(ug: UnitGroup, world: World, content: ContentLibrary, alpha: number): void {
    const px = ug.previousPosition.x + (ug.position.x - ug.previousPosition.x) * alpha;
    const py = ug.previousPosition.y + (ug.position.y - ug.previousPosition.y) * alpha;
    this.container.position.set(px, py);

    const tex = getUnitTexture(ug.sourceLiquid);

    if (tex !== null) {
      // Sprite path — primary.
      this.sprite.visible = true;
      this.sprite.texture = tex;
      const cs = countScale(ug.count);
      const displayH = SPRITE_BASE_DISPLAY_HEIGHT * world.visualScale * cs;
      const scale = displayH / tex.height;
      this.sprite.scale.set(scale);
      this.droplet.clear();

      // Position count label below the sprite's bottom edge.
      const spriteHalfH = (tex.height * scale) / 2;
      this.label.position.set(0, spriteHalfH + 2);
    } else {
      // Fallback procedural droplet (texture not yet loaded).
      this.sprite.visible = false;
      const owner = world.players.find((p) => p.id === ug.ownerId);
      const outlineColor = owner ? colorFromHex(owner.color) : 0xffffff;
      const liquidDef = content.liquids[ug.sourceLiquid];
      const fillColor = liquidDef ? colorFromHex(liquidDef.color) : 0x3da9fc;
      const baseRadius = 5;
      const raw = Math.min(baseRadius + Math.sqrt(Math.max(1, ug.count)) * 0.6, 14);
      const radius = raw * world.visualScale;
      this.droplet
        .clear()
        .circle(0, 0, radius)
        .fill({ color: fillColor, alpha: 0.95 })
        .circle(0, 0, radius)
        .stroke({ color: outlineColor, width: 1.5, alpha: 0.9 });
      this.label.position.set(0, 0);
    }

    // v2.7.5: always show count.
    const c = Math.floor(ug.count);
    this.label.text = c > 0 ? c.toString() : '';
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  get id(): string {
    return this.groupId;
  }
}
