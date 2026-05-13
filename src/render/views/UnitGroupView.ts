// UnitGroupView — renders one in-flight UnitGroup as a droplet.
// Color matches sourceLiquid; size scales mildly with count.

import { Container, Graphics, Text } from 'pixi.js';
import type { UnitGroup } from '../../engine/entities/UnitGroup';
import type { ContentLibrary } from '../../engine/content/ContentLibrary';
import type { World } from '../../engine/World';
import { colorFromHex } from '../shapes';

export class UnitGroupView {
  readonly container: Container;
  private readonly droplet: Graphics;
  private readonly label: Text;
  private readonly groupId: string;

  constructor(ug: UnitGroup) {
    this.groupId = ug.id;
    this.container = new Container();
    this.droplet = new Graphics();
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
    this.container.addChild(this.label);
  }

  update(ug: UnitGroup, world: World, content: ContentLibrary, alpha: number): void {
    const px = ug.previousPosition.x + (ug.position.x - ug.previousPosition.x) * alpha;
    const py = ug.previousPosition.y + (ug.position.y - ug.previousPosition.y) * alpha;
    this.container.position.set(px, py);

    const owner = world.players.find((p) => p.id === ug.ownerId);
    const outlineColor = owner ? colorFromHex(owner.color) : 0xffffff;

    const liquidDef = content.liquids[ug.sourceLiquid];
    const fillColor = liquidDef ? colorFromHex(liquidDef.color) : 0x3da9fc;

    // v2.7.6: scale droplet radius by world.visualScale so units track
    // the per-level node size.
    const baseRadius = 5;
    const raw = Math.min(baseRadius + Math.sqrt(Math.max(1, ug.count)) * 0.6, 14);
    const radius = raw * world.visualScale;

    this.droplet
      .clear()
      .circle(0, 0, radius)
      .fill({ color: fillColor, alpha: 0.95 })
      .circle(0, 0, radius)
      .stroke({ color: outlineColor, width: 1.5, alpha: 0.9 });

    // v2.7.5: always show count (was hidden when c < 5). The user can't
    // read a group's strength at a glance if the label vanishes for
    // small groups — and small groups are often the most decision-
    // relevant (deciding whether to send a defender, etc.).
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
