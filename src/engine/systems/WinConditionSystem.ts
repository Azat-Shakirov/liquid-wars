// WinConditionSystem — sets world.status when the level resolves (§14).
//
// Phase 5 semantics: win = eliminate every enemy player. Neutral nodes
// do NOT block a victory — if the player has wiped out all hostile
// ownership, neutrals on the map are irrelevant (they're terrain).
// The `controlAll` winCondition name is kept for backward compat with
// existing level JSONs; the semantic is now "no enemy nodes remain."
//
// v2.7.3: hold judgment while ANY UnitGroup is in flight. Pre-fix bug:
// a player could declare win or loss based on node ownership while
// units were still mid-air, leading to:
//   - false win: enemy nodes captured to neutral but enemy's in-flight
//     groups would arrive to retake territory.
//   - false loss: player loses last node but has units en route to
//     capture an enemy (or even neutral) node.
// Waiting for all groups to land makes the outcome unambiguous.

import type { World } from '../World';

export class WinConditionSystem {
  update(world: World, _dtMs: number): void {
    if (world.status !== 'playing') return;
    if (!world.humanPlayerId) return;

    // v2.7.3: never settle the game while units are still in flight.
    // Whatever they're going to do — capture, reinforce, get shot down —
    // affects the final ownership count.
    if (world.unitGroups.length > 0) return;

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

    if (world.level.winCondition.type === 'controlAll') {
      if (enemyNodes === 0 && humanNodes > 0) {
        world.status = 'won';
        return;
      }
    }

    if (humanNodes === 0) {
      world.status = 'lost';
    }
  }
}
