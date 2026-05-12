// ConcoctStrategy — Slime + spell-using AIs queue spells on idle Labs.
//
// Logic:
//   - Pick the first idle Lab (spellQueue===null, not frozen, in nodeOrder)
//     that can afford a spell at its current level.
//   - Spell preference: freeze (25u, L1) → recruit (50u, L3) → bleed (35u, L2).
//     Freeze is the cheapest disable; recruit is the highest-leverage cap
//     flip; bleed is the "pressure" option. Personality could weight this
//     further but for v2.7 the order is fixed (matches Slime AI's "spam
//     whatever's affordable" identity).
//   - Personality gate: `weights.spellUse > 0` required.
//   - Reserve check: lab.units must be > spell.unitCost + small buffer to
//     avoid leaving the lab empty (lab also has to be defensible).
//
// Determinism: node-order iteration, fixed spell preference list.

import type { Node } from '../../entities/Node';
import type { Strategy, StrategyDecision } from './BaseStrategy';
import type { World, Player } from '../../World';
import type { AIPersonalityDef, ContentLibrary } from '../../content/ContentLibrary';

const SPELL_PREFERENCE: readonly string[] = ['freeze', 'recruit', 'bleed'];
const LAB_RESERVE_BUFFER = 5;

export const ConcoctStrategy: Strategy = {
  id: 'ConcoctStrategy',
  decide(
    world: World,
    me: Player,
    personality: AIPersonalityDef,
    content: ContentLibrary,
  ): StrategyDecision | null {
    if (personality.weights.spellUse <= 0) return null;

    for (const id of world.nodeOrder) {
      const n: Node | undefined = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId !== me.id) continue;
      if (n.nodeType !== 'lab') continue;
      if (n.isFrozen) continue;
      if (n.spellQueue !== null) continue; // busy

      for (const spellId of SPELL_PREFERENCE) {
        const spell = content.spells[spellId];
        if (!spell) continue;
        if (spell.minLabLevel > n.level) continue;
        if (n.units < spell.unitCost + LAB_RESERVE_BUFFER) continue;
        return { kind: 'concoct', labNodeId: n.id, spellId };
      }
    }

    return null;
  },
};
