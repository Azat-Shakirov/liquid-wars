// UpgradeStrategy — every AI evaluates upgrades when strategically rational
// (v2.7). Spends units on `upgradeNode` instead of `sendUnits`.
//
// v2.7.1: trigger changed from "units ≥ upgradeUnitsReserve" (flat reserve)
// to "units ≥ maxUnits − SATURATION_BUFFER". An AI now upgrades exactly
// when a node is saturated and production is being wasted at the cap.
// Combined with multi-decision-per-tick in AIController, every saturated
// node gets upgraded in the same decision tick.
//
// Logic:
//   1. House conversion: prefer the personality's preferred target type
//      (tower if `weights.defense` ≥ 0.5, lab if `weights.spellUse` ≥ 0.5,
//      else barracks). Cost: 5/10/10 units for barracks/lab/tower.
//      Trigger: source.units ≥ maxUnits − SATURATION_BUFFER, where the
//      house's maxUnits is 20.
//   2. Within-type level-up: iterate owned nodes in nodeOrder, return the
//      first saturated node that can afford the next-level upgradeCost.
//      Skip if at max level.
//   3. House conversion takes priority over level-up.
//
// Determinism: nodeOrder iteration; first match wins (not cheapest).
// Multi-decision-per-tick (AIController) means the AI cycles through all
// saturated nodes in one tick, upgrading each.

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

// How close to maxUnits a node must be before the AI upgrades it. 2 is
// "essentially full" — production is wasted at this point, the upgrade
// converts those wasted units into a permanent capacity gain.
const SATURATION_BUFFER = 2;

function isSaturated(n: Node): boolean {
  return n.units >= n.maxUnits - SATURATION_BUFFER;
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

    // Step 1: House conversion at saturation.
    const targetType = preferredHouseTarget(personality);
    const targetDef = content.nodeTypes[targetType];
    const lv1 = targetDef?.levels.find((l) => l.level === 1);
    const conversionCost = lv1?.upgradeCostFromHouse ?? Infinity;

    if (Number.isFinite(conversionCost)) {
      for (const n of myNodes) {
        if (n.nodeType !== 'house') continue;
        if (!isSaturated(n)) continue;
        if (n.units < conversionCost) continue;
        return { kind: 'upgrade', nodeId: n.id, targetType };
      }
    }

    // Step 2: First saturated node that can afford its next-level upgrade.
    for (const n of myNodes) {
      const def = content.nodeTypes[n.nodeType];
      if (!def) continue;
      const next = def.levels.find((l) => l.level === n.level + 1);
      if (!next) continue; // at max level
      const cost = next.upgradeCost ?? Infinity;
      if (!Number.isFinite(cost)) continue;
      if (!isSaturated(n)) continue;
      if (n.units < cost) continue;
      return { kind: 'upgrade', nodeId: n.id };
    }

    return null;
  },
};
