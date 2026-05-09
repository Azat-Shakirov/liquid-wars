// DumbStrategy — the Phase 1 "easy" AI.
//
// Every decisionInterval, the AI:
//   1. Picks its fullest owned barracks above minSourceUnits.
//   2. Scores every non-owned node: prefer neutrals over enemies, then weaker
//      (after subtracting in-flight reinforcements I've already sent), then
//      nearer to source.
//   3. Sends 50% of source's units to the first scored target where attackRatio
//      is satisfied vs the projected defense.
//
// Deterministic — tie-breaks use sorted node id, not RNG. (§3.3.)

import type { Node } from '../../entities/Node';
import type { Strategy, StrategyDecision } from './BaseStrategy';
import type { World, Player } from '../../World';
import type { AIPersonalityDef, ContentLibrary } from '../../content/ContentLibrary';
import { vec2Distance } from '../../path';

const SEND_FRACTION = 0.5;

export const DumbStrategy: Strategy = {
  id: 'DumbStrategy',
  decide(
    world: World,
    me: Player,
    personality: AIPersonalityDef,
    _content: ContentLibrary,
  ): StrategyDecision | null {
    const myNodes: Node[] = [];
    const targets: Node[] = [];
    for (const id of world.nodeOrder) {
      const n = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId === me.id) myNodes.push(n);
      else targets.push(n);
    }

    const sources = myNodes
      .filter((n) => !n.isFrozen && n.units >= personality.thresholds.minSourceUnits)
      .sort((a, b) => b.units - a.units || (a.id < b.id ? -1 : 1));
    if (sources.length === 0) return null;

    const source = sources[0]!;
    const sendCount = Math.floor(source.units * SEND_FRACTION);
    if (sendCount <= 0) return null;

    if (targets.length === 0) return null;

    const inFlightToward = new Map<string, number>();
    for (const ug of world.unitGroups) {
      if (ug.ownerId !== me.id) continue;
      inFlightToward.set(ug.toNodeId, (inFlightToward.get(ug.toNodeId) ?? 0) + ug.count);
    }

    type Scored = { node: Node; score: number };
    const scored: Scored[] = targets.map((t) => {
      const projectedDefense = Math.max(0, t.units - (inFlightToward.get(t.id) ?? 0));
      const ownerWeight = t.ownerId === null ? 0 : 1000;
      const dist = vec2Distance(source.position, t.position);
      return { node: t, score: ownerWeight + projectedDefense * 5 + dist * 0.01 };
    });

    scored.sort((a, b) => a.score - b.score || (a.node.id < b.node.id ? -1 : 1));

    for (const cand of scored) {
      const t = cand.node;
      const projectedDefense = Math.max(0, t.units - (inFlightToward.get(t.id) ?? 0));
      if (sendCount > projectedDefense * personality.thresholds.attackRatio) {
        return { fromNodeIds: [source.id], toNodeId: t.id, fraction: SEND_FRACTION };
      }
    }

    return null;
  },
};
