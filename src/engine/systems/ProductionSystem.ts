// ProductionSystem — Barracks (and later Houses) produce units toward maxUnits.
// productionRate is units-per-second per the level config; we convert to per-tick
// and apply the productionMultiplier from the node's current liquid (§5.3).

import type { World } from '../World';
import type { ContentLibrary } from '../content/ContentLibrary';
import { effectValueForLiquid } from '../effects/EffectRegistry';
import type { LiquidId, NodeTypeId } from '../../types';

export class ProductionSystem {
  constructor(private readonly content: ContentLibrary) {}

  update(world: World, dtMs: number): void {
    const dtSec = dtMs / 1000;

    for (const id of world.nodeOrder) {
      const node = world.nodes.get(id);
      if (!node) continue;
      if (node.ownerId === null) continue;        // neutral nodes do not produce
      if (node.isFrozen) continue;                 // frozen nodes paused (§7.2)
      if (node.poisonStacks.length > 0) continue; // bleeding nodes cannot produce (user spec patch)
      if (node.units >= node.maxUnits) continue;   // capped

      const typeDef = this.content.nodeTypes[node.nodeType as NodeTypeId];
      if (!typeDef) continue;
      // Tower explicitly cannot produce (§6.1, §20 item 3).
      if (typeDef.producesUnits === false) continue;

      const lv = typeDef.levels.find((l) => l.level === node.level);
      const baseRate = lv?.productionRate ?? 0;
      if (baseRate <= 0) continue;

      const liquid = this.content.liquids[node.liquidType as LiquidId];
      const mult = liquid ? effectValueForLiquid(liquid, 'productionMultiplier') : 1;

      node.units = Math.min(node.maxUnits, node.units + baseRate * mult * dtSec);
    }
  }
}
