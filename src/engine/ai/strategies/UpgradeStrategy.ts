// UpgradeStrategy — every AI evaluates upgrades when strategically rational
// (v2.7). Spends units on `upgradeNode` instead of `sendUnits`.
//
// Rationale (per author): "each liquid can upgrade its node as it is
// strategically rational. however, if there is a better move - they do
// it." So this strategy sits early in the personality's strategy chain
// for develop-leaning AIs (Water, Ink) and later for rushers (Blood).
//
// Logic:
//   1. House conversion: prefer the personality's preferred target type
//      (tower if `weights.defense` ≥ 0.5, lab if `weights.spellUse` ≥ 0.5,
//      else barracks). Conversion cost from house: 5 / 10 / 10 units for
//      barracks / lab / tower respectively. Requires source.units ≥ cost
//      AND source.units ≥ upgradeUnitsReserve (so we don't gut the node).
//   2. Within-type level-up: pick the cheapest viable upgrade across all
//      owned nodes. Skip if at max level. Same reserve check.
//   3. House conversion takes priority over level-up (a house is the
//      worst structure type in v1; converting is almost always correct).
//
// Determinism: candidate nodes are iterated in `world.nodeOrder`; ties
// broken on node id (string compare). No RNG.

import type { Node } from '../../entities/Node';
import type { Strategy, StrategyDecision } from './BaseStrategy';
import type { World, Player } from '../../World';
import type { AIPersonalityDef, ContentLibrary } from '../../content/ContentLibrary';
import type { NodeTypeId } from '../../../types';

function preferredHouseTarget(personality: AIPersonalityDef): NodeTypeId {
  const w = personality.weights;
  if (w.defense >= 0.5 && w.defense >= w.spellUse) return 'tower';
  if (w.spellUse >= 0.5) return 'lab';
  return 'barracks';
}

export const UpgradeStrategy: Strategy = {
  id: 'UpgradeStrategy',
  decide(
    world: World,
    me: Player,
    personality: AIPersonalityDef,
    content: ContentLibrary,
  ): StrategyDecision | null {
    const myNodes: Node[] = [];
    for (const id of world.nodeOrder) {
      const n = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId !== me.id) continue;
      if (n.isFrozen) continue;
      myNodes.push(n);
    }
    if (myNodes.length === 0) return null;

    const reserve = personality.thresholds.upgradeUnitsReserve;

    // Step 1: House conversion. Pick the first house (in node-order) that
    // can afford its preferred conversion. House conversion is high-value
    // — houses produce slowly and are never the right end state.
    const targetType = preferredHouseTarget(personality);
    const targetDef = content.nodeTypes[targetType];
    const lv1 = targetDef?.levels.find((l) => l.level === 1);
    const conversionCost = lv1?.upgradeCostFromHouse ?? Infinity;

    if (Number.isFinite(conversionCost)) {
      for (const n of myNodes) {
        if (n.nodeType !== 'house') continue;
        if (n.units < conversionCost) continue;
        if (n.units < reserve) continue;
        return { kind: 'upgrade', nodeId: n.id, targetType };
      }
    }

    // Step 2: Cheapest viable within-type level-up.
    type Cand = { node: Node; cost: number };
    let cheapest: Cand | null = null;
    for (const n of myNodes) {
      const def = content.nodeTypes[n.nodeType];
      if (!def) continue;
      const next = def.levels.find((l) => l.level === n.level + 1);
      if (!next) continue; // at max level
      const cost = next.upgradeCost ?? Infinity;
      if (!Number.isFinite(cost)) continue;
      if (n.units < cost) continue;
      if (n.units < reserve) continue;
      if (!cheapest || cost < cheapest.cost ||
        (cost === cheapest.cost && n.id < cheapest.node.id)) {
        cheapest = { node: n, cost };
      }
    }

    if (cheapest) {
      return { kind: 'upgrade', nodeId: cheapest.node.id };
    }

    return null;
  },
};
