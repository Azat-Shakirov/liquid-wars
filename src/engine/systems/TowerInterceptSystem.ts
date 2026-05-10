// TowerInterceptSystem — Towers attack enemy UnitGroups in flight (§8, §6.1).
//
// Per tick, each owned, non-frozen Tower:
//   1. Decrements attackCooldownMs by dtMs (clamped at 0).
//   2. If cooldown is 0, scans for the nearest enemy UnitGroup whose
//      current position is within attackRange.
//   3. If one is found, reduces its count by attackDamage and resets
//      cooldown to 1000 / attackRate (ms between shots).
//
// Sits between MovementSystem and CombatSystem in the tick order so
// that towers fire at the up-to-date positions, and any group whose
// count drops to 0 is removed before CombatSystem resolves arrivals.
//
// Determinism: tower iteration order = nodeOrder; UnitGroup iteration
// follows world.unitGroups (insertion order). Tie-break on equal
// distances uses UnitGroup.id (string compare). No RNG.

import type { World } from '../World';
import type { Node } from '../entities/Node';
import type { UnitGroup } from '../entities/UnitGroup';
import type { ContentLibrary } from '../content/ContentLibrary';
import type { NodeTypeId } from '../../types';

export interface TowerShot {
  fromNodeId: string;
  toUnitGroupId: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  // Tick the shot was fired (for fade-out timing in the renderer).
  firedAtTick: number;
}

export class TowerInterceptSystem {
  // Transient buffer of shots that landed THIS tick. The renderer
  // consumes these to draw beams. Cleared at the start of every update.
  readonly recentShots: TowerShot[] = [];

  constructor(private readonly content: ContentLibrary) {}

  update(world: World, dtMs: number): void {
    this.recentShots.length = 0;
    if (world.unitGroups.length === 0) {
      // Still need to tick down cooldowns even if there are no targets.
      for (const id of world.nodeOrder) {
        const n = world.nodes.get(id);
        if (n && n.attackCooldownMs > 0) {
          n.attackCooldownMs = Math.max(0, n.attackCooldownMs - dtMs);
        }
      }
      return;
    }

    for (const id of world.nodeOrder) {
      const tower = world.nodes.get(id);
      if (!tower) continue;
      if (tower.nodeType !== 'tower') {
        // Towers are the only attackers. Other types ignore cooldown.
        continue;
      }
      if (tower.ownerId === null) continue;
      if (tower.isFrozen) continue;

      const stats = this.statsForTower(tower.nodeType, tower.level);
      if (!stats) continue;

      tower.attackCooldownMs = Math.max(0, tower.attackCooldownMs - dtMs);
      if (tower.attackCooldownMs > 0) continue;

      const target = this.pickTarget(world, tower, stats.attackRange);
      if (!target) continue;

      target.count = Math.max(0, target.count - stats.attackDamage);
      tower.attackCooldownMs = stats.attackRate > 0 ? 1000 / stats.attackRate : Infinity;

      this.recentShots.push({
        fromNodeId: tower.id,
        toUnitGroupId: target.id,
        fromPos: { x: tower.position.x, y: tower.position.y },
        toPos: { x: target.position.x, y: target.position.y },
        firedAtTick: world.tick,
      });
    }

    // Sweep dead groups (count <= 0). Cheaper than per-iteration splice.
    if (world.unitGroups.some((g) => g.count <= 0)) {
      world.unitGroups = world.unitGroups.filter((g) => g.count > 0);
    }
  }

  private statsForTower(
    type: NodeTypeId,
    level: number,
  ): { attackRate: number; attackRange: number; attackDamage: number } | null {
    const def = this.content.nodeTypes[type];
    if (!def) return null;
    const lv = def.levels.find((l) => l.level === level);
    if (!lv) return null;
    if (lv.attackRate === undefined || lv.attackRange === undefined || lv.attackDamage === undefined) {
      return null;
    }
    return {
      attackRate: lv.attackRate,
      attackRange: lv.attackRange,
      attackDamage: lv.attackDamage,
    };
  }

  private pickTarget(world: World, tower: Node, range: number): UnitGroup | null {
    const r2 = range * range;
    let best: UnitGroup | null = null;
    let bestD2 = Infinity;

    for (const ug of world.unitGroups) {
      if (ug.ownerId === tower.ownerId) continue; // friendly
      const dx = ug.position.x - tower.position.x;
      const dy = ug.position.y - tower.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (d2 < bestD2 || (d2 === bestD2 && best !== null && ug.id < best.id)) {
        best = ug;
        bestD2 = d2;
      }
    }
    return best;
  }
}
