// CombatSystem — resolves arrivals each tick per §4.5.
//
// Order (deterministic):
//   1. Collect all arrived UnitGroups (pathProgress >= 1).
//   2. Sort by arrivalTick asc, ties broken by id asc.
//   3. Apply each one in turn. Each arrival sees the state left by the prior.
//
// Capture rules:
//   - Friendly arrival → top up node.units, capped at maxUnits.
//   - Hostile/neutral arrival → subtract scaled attacker count from defender.
//     If defender drops to <= 0, ownership flips, remaining count seeds the
//     new owner's pool, liquid converts to attacker's sourceLiquid, in-progress
//     concoction is cancelled, poison stacks cleared.
//   - Frozen target → arrivals queue and apply when freeze expires (§20 item 10).
//     Queue lives on the node as `pendingArrivals` (Phase 2 spell, but the
//     queue is created here lazily so the data path is consistent).

import type { World } from '../World';
import type { Node } from '../entities/Node';
import type { UnitGroup } from '../entities/UnitGroup';
import type { ContentLibrary } from '../content/ContentLibrary';
import { effectValueForLiquid } from '../effects/EffectRegistry';
import type { LiquidId } from '../../types';

interface FrozenPendingHolder {
  pendingArrivals?: UnitGroup[];
}

export class CombatSystem {
  constructor(private readonly content: ContentLibrary) {}

  update(world: World, _dtMs: number): void {
    if (world.unitGroups.length === 0) return;

    const arrived: UnitGroup[] = [];
    const remaining: UnitGroup[] = [];
    for (const ug of world.unitGroups) {
      if (ug.pathProgress >= 1) arrived.push(ug);
      else remaining.push(ug);
    }
    if (arrived.length === 0) return;

    arrived.sort((a, b) => {
      if (a.arrivalTick !== b.arrivalTick) return a.arrivalTick - b.arrivalTick;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    for (const ug of arrived) {
      const target = world.nodes.get(ug.toNodeId);
      if (!target) continue; // shouldn't happen — defensive

      if (target.isFrozen) {
        // Hold at boundary until freeze expires (§20 item 10).
        const holder = target as Node & FrozenPendingHolder;
        holder.pendingArrivals = holder.pendingArrivals ?? [];
        holder.pendingArrivals.push(ug);
        continue;
      }

      this.resolveArrival(ug, target);
    }

    world.unitGroups = remaining;
  }

  private resolveArrival(ug: UnitGroup, target: Node): void {
    const sourceLiquid = this.content.liquids[ug.sourceLiquid as LiquidId];

    // Step 1: incoming damage modifier from defender's current liquid (§5.3).
    let effectiveCount = ug.count;
    const defenderLiquid =
      target.ownerId !== null
        ? this.content.liquids[target.liquidType as LiquidId]
        : undefined;
    if (defenderLiquid) {
      effectiveCount *= effectValueForLiquid(defenderLiquid, 'incomingDamageMultiplier');
    }

    // Step 1b: Tower per-arrival defense (user spec patch). Towers
    // shave a flat defenseRate off HOSTILE incoming counts only;
    // friendly reinforcements are top-ups and pass through. Neutral
    // towers don't defend.
    const hostileArrival =
      target.ownerId !== null && target.ownerId !== ug.ownerId;
    if (hostileArrival && target.nodeType === 'tower') {
      const def = this.content.nodeTypes[target.nodeType];
      const lv = def?.levels.find((l) => l.level === target.level);
      const defenseRate = lv?.defenseRate ?? 0;
      if (defenseRate > 0) {
        effectiveCount = Math.max(0, effectiveCount - defenseRate);
      }
    }
    if (effectiveCount <= 0) return;

    // Step 2: friendly arrival — top up.
    if (target.ownerId !== null && target.ownerId === ug.ownerId) {
      target.units = Math.min(target.maxUnits, target.units + effectiveCount);
      return;
    }

    // Step 3+: hostile / neutral. Apply capture-cost multiplier from attacker's liquid.
    let attackPower = effectiveCount;
    if (sourceLiquid) {
      const captureCostMult = effectValueForLiquid(sourceLiquid, 'captureCostMultiplier');
      // captureCostMult < 1 means cheaper to capture; equivalent to amplifying attack.
      if (captureCostMult > 0) attackPower = effectiveCount / captureCostMult;
    }

    target.units -= attackPower;

    if (target.units > 0) {
      // Defender holds.
      return;
    }

    // Ownership flips.
    const remaining = -target.units; // positive remainder
    target.ownerId = ug.ownerId;
    target.units = Math.min(target.maxUnits, remaining);
    target.liquidType = ug.sourceLiquid;
    target.spellQueue = null;
    target.poisonStacks = [];
    target.productionProgress = 0;
    target.isFrozen = false;
    target.frozenUntilTick = 0;
  }
}
