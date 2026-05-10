// SpellConcoctionSystem (§7.3, §8) — advances per-tick spell concoction
// on Labs. Pay-on-cast: nothing is deducted while concocting, only on
// the eventual cast. Cancellation is consequence-free.
//
// Per tick, for each Lab with a spellQueue in 'concocting' state:
//   • If owner became null (e.g. captured to neutral by a Freeze),
//     drop the spellQueue. (Ownership flips also clear spellQueue
//     in CombatSystem, but the freeze path can null the owner without
//     a CombatSystem visit, so we double-check here.)
//   • If Lab.units < spell.unitCost, drop the spellQueue (cost
//     violation per SPEC §7.3).
//   • If Lab is frozen, pause progress (no advance, no cancel).
//   • Otherwise advance progress by
//     (concoctSpeed × spellSpeedMultiplier × dtMs) / concoctTimeMs.
//   • When progress hits 1.0, transition to 'ready'. The player then
//     picks a target via the input layer; engine.castSpell deducts
//     units and applies the effect.

import type { World } from '../World';
import type { ContentLibrary } from '../content/ContentLibrary';
import { effectValueForLiquid } from '../effects/EffectRegistry';
import type { LiquidId } from '../../types';

export class SpellConcoctionSystem {
  constructor(private readonly content: ContentLibrary) {}

  update(world: World, dtMs: number): void {
    for (const id of world.nodeOrder) {
      const node = world.nodes.get(id);
      if (!node || !node.spellQueue) continue;
      if (node.nodeType !== 'lab') {
        // Defensive: only Labs concoct. Drop the orphan queue.
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

      // Slime liquid (Phase 4) buffs spell speed; until then this
      // resolves to 1.0 because no liquid registers spellSpeedMultiplier.
      const liquid = this.content.liquids[node.liquidType as LiquidId];
      const speedMult = liquid ? effectValueForLiquid(liquid, 'spellSpeedMultiplier') : 1;

      const advance = (concoctSpeed * speedMult * dtMs) / spell.concoctTimeMs;
      node.spellQueue.progress = Math.min(1, node.spellQueue.progress + advance);
      if (node.spellQueue.progress >= 1) {
        node.spellQueue.state = 'ready';
      }
    }
  }
}
