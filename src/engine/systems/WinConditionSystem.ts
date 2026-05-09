// WinConditionSystem — sets world.status when the level resolves (§14).
// Phase 1 supports only `controlAll`. Loss = human owns zero nodes AND has
// zero in-flight unit groups (§14).

import type { World } from '../World';

export class WinConditionSystem {
  update(world: World, _dtMs: number): void {
    if (world.status !== 'playing') return;
    if (!world.humanPlayerId) return;

    const human = world.humanPlayerId;
    let humanNodes = 0;
    let aiNodes = 0;
    let neutralNodes = 0;

    for (const id of world.nodeOrder) {
      const n = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId === null) neutralNodes++;
      else if (n.ownerId === human) humanNodes++;
      else aiNodes++;
    }

    const humanInFlight = world.unitGroups.some((ug) => ug.ownerId === human);

    if (world.level.winCondition.type === 'controlAll') {
      if (aiNodes === 0 && neutralNodes === 0 && humanNodes > 0) {
        world.status = 'won';
        return;
      }
    }

    if (humanNodes === 0 && !humanInFlight) {
      world.status = 'lost';
    }
  }
}
