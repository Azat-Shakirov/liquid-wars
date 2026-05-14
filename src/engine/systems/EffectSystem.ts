// EffectSystem (§7.2, §20 item 10, §20 item 41) — runs after CombatSystem each tick.
//
//   • Drains starve: for every node with starveStacks, subtract
//     drainPerSecond * dtSec total per stack from node.units (floored at 0).
//     v2.8.0: stacks NEVER expire by time. They persist until the node is
//     captured by a non-current-owner (CombatSystem clears stacks on flip).
//   • Expires freezes: when world.tick reaches frozenUntilTick, the
//     node thaws (isFrozen → false). Any UnitGroups that were held
//     in pendingArrivals while the node was frozen are pushed back
//     onto world.unitGroups so the next tick's CombatSystem resolves
//     them against the (now-thawed, currently neutral) target.
//
// One-tick latency on thaw resolution is fine — it's invisible at
// 60Hz and avoids re-entering CombatSystem mid-update.

import type { World } from '../World';
import type { Node } from '../entities/Node';
import type { UnitGroup } from '../entities/UnitGroup';

interface FrozenPendingHolder {
  pendingArrivals?: UnitGroup[];
}

export class EffectSystem {
  update(world: World, dtMs: number): void {
    const dtSec = dtMs / 1000;

    for (const id of world.nodeOrder) {
      const node = world.nodes.get(id);
      if (!node) continue;

      // Freeze expiration.
      if (node.isFrozen && world.tick >= node.frozenUntilTick) {
        node.isFrozen = false;
        node.frozenUntilTick = 0;
        const holder = node as Node & FrozenPendingHolder;
        if (holder.pendingArrivals && holder.pendingArrivals.length > 0) {
          for (const ug of holder.pendingArrivals) {
            world.unitGroups.push(ug);
          }
          holder.pendingArrivals = [];
        }
      }

      // Starve drain (v2.8.0: no time-expiry pruning anymore).
      if (node.starveStacks.length > 0) {
        let totalDrain = 0;
        for (const s of node.starveStacks) {
          totalDrain += s.drainPerSecond * dtSec;
        }
        if (totalDrain > 0) {
          node.units = Math.max(0, node.units - totalDrain);
        }
      }
    }
  }
}
