// UnitGroupView — renders one in-flight UnitGroup as a marching infantry
// sprite. Two walk-cycle frames alternate every WALK_FRAME_MS to animate
// the step; sprite mirrors horizontally based on heading so the soldier
// faces the way they walk.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { UnitGroup } from '../../engine/entities/UnitGroup';
import type { ContentLibrary } from '../../engine/content/ContentLibrary';
import type { World } from '../../engine/World';
import { colorFromHex } from '../shapes';
import { getUnitFrame } from '../sprites/unitSprites';

// Sprite display height at world.visualScale = 1. Soldiers ought to read
// as comparable in scale to a base-size tower (~76 px high after the 1.7×
// factor) but smaller — a unit not a building.
const SPRITE_BASE_DISPLAY_HEIGHT = 30;
const WALK_FRAME_MS = 220;

function countScale(count: number): number {
  const c = Math.max(1, count);
  return Math.min(1.5, 0.85 + Math.sqrt(c) * 0.06);
}

export class UnitGroupView {
  readonly container: Container;
  private readonly groundShadow: Graphics;
  private readonly droplet: Graphics;
  private readonly sprite: Sprite;
  private readonly label: Text;
  private readonly groupId: string;
  // Source-image soldiers face their LEFT (sword + cape on their left side).
  // We treat that as the "natural" heading; if the group is moving right we
  // flip horizontally so the soldier faces right.
  private facingRight = false;

  constructor(ug: UnitGroup) {
    this.groupId = ug.id;
    this.container = new Container();
    this.groundShadow = new Graphics();
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
    this.container.addChild(this.groundShadow);
    this.container.addChild(this.droplet);
    this.container.addChild(this.sprite);
    this.container.addChild(this.label);
  }

  update(
    ug: UnitGroup,
    world: World,
    content: ContentLibrary,
    alpha: number,
    nowMs: number,
  ): void {
    const px = ug.previousPosition.x + (ug.position.x - ug.previousPosition.x) * alpha;
    const py = ug.previousPosition.y + (ug.position.y - ug.previousPosition.y) * alpha;
    this.container.position.set(px, py);

    // Heading: use the tick-delta. Only update facing when the delta is
    // big enough to be meaningful — avoids flickering at stationary moments.
    const dx = ug.position.x - ug.previousPosition.x;
    if (dx > 0.5) this.facingRight = true;
    else if (dx < -0.5) this.facingRight = false;

    const frame = Math.floor(nowMs / WALK_FRAME_MS) & 1;
    const tex = getUnitFrame(ug.sourceFaction, frame);

    if (tex !== null) {
      this.sprite.visible = true;
      this.sprite.texture = tex;
      const cs = countScale(ug.count);
      const displayH = SPRITE_BASE_DISPLAY_HEIGHT * world.visualScale * cs;
      const baseScale = displayH / tex.height;
      this.sprite.scale.set(this.facingRight ? -baseScale : baseScale, baseScale);
      this.droplet.clear();

      const spriteHalfH = (tex.height * baseScale) / 2;
      const spriteHalfW = (tex.width * baseScale) / 2;
      // Tight contact shadow at the soldier's feet. Anchor on the sprite
      // is (0.5, 0.55) so the bottom of the sprite is at +spriteHalfH * 0.9.
      // The shadow ellipse is small (a third of the sprite width) and sits
      // a hair above the bottom edge so it reads as feet-on-ground rather
      // than a wide blob below.
      this.groundShadow.clear();
      const sShadowRX = Math.max(3, spriteHalfW * 0.32);
      const sShadowRY = Math.max(1.5, spriteHalfH * 0.07);
      const sShadowCY = spriteHalfH * 0.85;
      this.groundShadow
        .ellipse(0, sShadowCY, sShadowRX, sShadowRY)
        .fill({ color: 0x000000, alpha: 0.40 });
      this.label.position.set(0, spriteHalfH + 2);
    } else {
      // Pre-load fallback: procedural droplet (first frame only).
      this.sprite.visible = false;
      this.groundShadow.clear();
      const owner = world.players.find((p) => p.id === ug.ownerId);
      const outlineColor = owner ? colorFromHex(owner.color) : 0xffffff;
      const factionDef = content.factions[ug.sourceFaction];
      const fillColor = factionDef ? colorFromHex(factionDef.color) : 0x3da9fc;
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
