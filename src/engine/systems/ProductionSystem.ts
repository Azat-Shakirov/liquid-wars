// ProductionSystem — Barracks (and later Houses) produce units toward maxUnits.
// productionRate is units-per-second per the level config; we convert to per-tick
// and apply the productionMultiplier from the node's current faction (§5.3) AND
// from the owner's archetype buff (v2.8.0, e.g. Infantry +10%).

import type { World } from '../World';
import type { ContentLibrary } from '../content/ContentLibrary';
import { effectValueForFaction } from '../effects/EffectRegistry';
import type { FactionId, NodeTypeId } from '../../types';

export class ProductionSystem {
  constructor(private readonly content: ContentLibrary) {}

  update(world: World, dtMs: number): void {
    const dtSec = dtMs / 1000;

    for (const id of world.nodeOrder) {
      const node = world.nodes.get(id);
      if (!node) continue;

      // Over-capacity drain (user spec patch): nodes that exceed
      // their maxUnits leak 1 unit/sec until they're back at the
      // cap. Skip production this tick if we drained.
      if (node.units > node.maxUnits) {
        node.units = Math.max(node.maxUnits, node.units - 1 * dtSec);
        continue;
      }

      if (node.ownerId === null) continue;          // neutral nodes do not produce
      if (node.isFrozen) continue;                   // frozen nodes paused (§7.2)
      if (node.starveStacks.length > 0) continue;   // starving nodes cannot produce (v2.8.0)
      if (node.units >= node.maxUnits) continue;     // capped

      const typeDef = this.content.nodeTypes[node.nodeType as NodeTypeId];
      if (!typeDef) continue;
      if (typeDef.producesUnits === false) continue;

      const lv = typeDef.levels.find((l) => l.level === node.level);
      const baseRate = lv?.productionRate ?? 0;
      if (baseRate <= 0) continue;

      const faction = this.content.factions[node.faction as FactionId];
      let mult = faction ? effectValueForFaction(faction, 'productionMultiplier') : 1;

      // v2.8.0 archetype buff: productionMultiplier (Infantry +10%).
      const owner = world.players.find((p) => p.id === node.ownerId);
      if (owner) {
        const arch = this.content.archetypes[owner.archetype];
        if (arch && arch.buff.type === 'productionMultiplier') {
          mult *= arch.buff.value;
        }
      }

      node.units = Math.min(node.maxUnits, node.units + baseRate * mult * dtSec);
    }
  }
}
