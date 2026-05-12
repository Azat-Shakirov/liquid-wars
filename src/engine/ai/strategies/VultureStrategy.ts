// VultureStrategy — Venom AI's signature behavior. Strikes targets
// only when they're below a unit threshold; otherwise yields to other
// strategies in the chain.
//
// Per author: "Venom is like a vulture - attacks when a node has low
// unit count. Its gameplay is fast-paced sending from one node to
// another." So the controller's decisionIntervalMs is set lower for
// Venom (in venom.json) and this strategy picks weak prey from any
// source above minSourceUnits.
//
// Target picking:
//   - Only consider non-self nodes with `effectiveUnits < VULTURE_THRESHOLD`
//     where effectiveUnits = node.units - sum(in-flight friendly toward node).
//   - Prefer neutrals over enemies (cheap territory).
//   - Tiebreak: weaker target first, then closer to source, then id.
//
// Send fraction is high (0.75) — vulture sends are committed strikes.

import type { Node } from '../../entities/Node';
import type { Strategy, StrategyDecision } from './BaseStrategy';
import type { World, Player } from '../../World';
import type { AIPersonalityDef, ContentLibrary } from '../../content/ContentLibrary';
import { vec2Distance } from '../../path';

const VULTURE_THRESHOLD = 6;
const SEND_FRACTION = 0.75;

export const VultureStrategy: Strategy = {
  id: 'VultureStrategy',
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
    if (targets.length === 0) return null;

    const inFlightToward = new Map<string, number>();
    for (const ug of world.unitGroups) {
      if (ug.ownerId !== me.id) continue;
      inFlightToward.set(ug.toNodeId, (inFlightToward.get(ug.toNodeId) ?? 0) + ug.count);
    }

    type Scored = { node: Node; effective: number; dist: number };
    const prey: Scored[] = [];
    const source = sources[0]!;
    for (const t of targets) {
      const inFlight = inFlightToward.get(t.id) ?? 0;
      const effective = Math.max(0, t.units - inFlight);
      if (effective >= VULTURE_THRESHOLD) continue;
      prey.push({ node: t, effective, dist: vec2Distance(source.position, t.position) });
    }
    if (prey.length === 0) return null;

    prey.sort((a, b) => {
      // Neutrals first.
      const aN = a.node.ownerId === null ? 0 : 1;
      const bN = b.node.ownerId === null ? 0 : 1;
      if (aN !== bN) return aN - bN;
      if (a.effective !== b.effective) return a.effective - b.effective;
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.node.id < b.node.id ? -1 : 1;
    });

    const t = prey[0]!.node;
    const sendCount = Math.floor(source.units * SEND_FRACTION);
    if (sendCount <= prey[0]!.effective * personality.thresholds.attackRatio) return null;

    return { kind: 'send', fromNodeIds: [source.id], toNodeId: t.id, fraction: SEND_FRACTION };
  },
};
