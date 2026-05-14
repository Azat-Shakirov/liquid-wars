// SpellConcoctionSystem (§7.3, §8) — advances per-tick spell concoction
// on Labs. Pay-on-cast: nothing is deducted while concocting, only on
// the eventual cast. Cancellation is consequence-free.
//
// v2.8.0: applies the OWNER's archetype `spellConcoctMultiplier` buff
// (Mage 3×). Legacy faction `spellSpeedMultiplier` (any liquid-era
// faction effect) still stacks.

import type { World } from '../World';
import type { ContentLibrary } from '../content/ContentLibrary';
import { effectValueForFaction } from '../effects/EffectRegistry';
import type { FactionId } from '../../types';

export class SpellConcoctionSystem {
  constructor(private readonly content: ContentLibrary) {}

  update(world: World, dtMs: number): void {
    for (const id of world.nodeOrder) {
      const node = world.nodes.get(id);
      if (!node || !node.spellQueue) continue;
      if (node.nodeType !== 'lab') {
        node.spellQueue = null;
        continue;
      }
      if (node.spellQueue.state === 'ready') continue;
      if (node.ownerId === null) {
        node.spellQueue = null;
        continue;
      }

      const spell = this.content.spells[node.spellQueue.spellId];
      if (!spell) {
        node.spellQueue = null;
        continue;
      }
      if (node.units < spell.unitCost) {
        node.spellQueue = null;
        continue;
      }
      if (node.isFrozen) continue;

      const labDef = this.content.nodeTypes[node.nodeType];
      const lv = labDef?.levels.find((l) => l.level === node.level);
      const concoctSpeed = lv?.concoctSpeed ?? 1;

      const faction = this.content.factions[node.faction as FactionId];
      let speedMult = faction ? effectValueForFaction(faction, 'spellSpeedMultiplier') : 1;

      // v2.8.0 archetype buff: spellConcoctMultiplier (Mage 3×).
      const owner = world.players.find((p) => p.id === node.ownerId);
      if (owner) {
        const arch = this.content.archetypes[owner.archetype];
        if (arch && arch.buff.type === 'spellConcoctMultiplier') {
          speedMult *= arch.buff.value;
        }
      }

      const advance = (concoctSpeed * speedMult * dtMs) / spell.concoctTimeMs;
      node.spellQueue.progress = Math.min(1, node.spellQueue.progress + advance);
      if (node.spellQueue.progress >= 1) {
        node.spellQueue.state = 'ready';
      }
    }
  }
}
