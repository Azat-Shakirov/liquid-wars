// WinConditionSystem — sets world.status when the level resolves (§14).
//
// Phase 5 semantics: win = eliminate every enemy player. Neutral nodes
// do NOT block a victory — if the player has wiped out all hostile
// ownership, neutrals on the map are irrelevant (they're terrain).
// The `controlAll` winCondition name is kept for backward compat with
// existing level JSONs; the semantic is now "no enemy nodes remain."
// Loss = human owns zero nodes AND has zero in-flight unit groups.

import type { World } from '../World';

export class WinConditionSystem {
  update(world: World, _dtMs: number): void {
    if (world.status !== 'playing') return;
    if (!world.humanPlayerId) return;

    const human = world.humanPlayerId;
    let humanNodes = 0;
    let enemyNodes = 0;

    for (const id of world.nodeOrder) {
      const n = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId === null) continue;        // neutral — irrelevant for win/loss
      if (n.ownerId === human) humanNodes++;
      else enemyNodes++;
    }

    const humanInFlight = world.unitGroups.some((ug) => ug.ownerId === human);

    if (world.level.winCondition.type === 'controlAll') {
      if (enemyNodes === 0 && humanNodes > 0) {
        world.status = 'won';
        return;
      }
    }

    if (humanNodes === 0 && !humanInFlight) {
      world.status = 'lost';
    }
  }
}
