// EffectSystem (§7.2, §20 item 10) — runs after CombatSystem each tick.
//
//   • Drains poison: for every node with poisonStacks, subtract
//     drainPerSecond * dtSec total per stack from node.units (floored
//     at 0). Removes stacks whose expiresTick has passed.
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

      // Poison drain + expiry.
      if (node.poisonStacks.length > 0) {
        let totalDrain = 0;
        for (const s of node.poisonStacks) {
          totalDrain += s.drainPerSecond * dtSec;
        }
        if (totalDrain > 0) {
          node.units = Math.max(0, node.units - totalDrain);
        }
        const live = node.poisonStacks.filter((s) => world.tick < s.expiresTick);
        if (live.length !== node.poisonStacks.length) {
          node.poisonStacks = live;
        }
      }
    }
  }
}
