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
import { effectValueForFaction } from '../effects/EffectRegistry';
import type { FactionId } from '../../types';

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

      this.resolveArrival(ug, target, world);
    }

    world.unitGroups = remaining;
  }

  private resolveArrival(ug: UnitGroup, target: Node, world: World): void {
    const sourceFaction = this.content.factions[ug.sourceFaction as FactionId];

    // True when this arrival is anything other than a friendly
    // reinforcement — i.e. attacking an enemy OR capturing a neutral.
    // Neutrals are treated as a faction (v2.6.2): their faction defends
    // on arrival and their towers apply defenseRate.
    const hostileArrival = target.ownerId !== ug.ownerId;

    let effectiveCount = ug.count;

    // Step 1: incoming damage modifier from defender's current faction
    // (§5.3). Capture / attack arrivals only — friendly reinforcements
    // aren't "damage" and must pass through the defender's defensive
    // faction unchanged.
    if (hostileArrival) {
      const defenderFaction = this.content.factions[target.faction as FactionId];
      if (defenderFaction) {
        effectiveCount *= effectValueForFaction(defenderFaction, 'incomingDamageMultiplier');
      }
    }

    // Step 1b: Tower per-arrival defense. Towers divide capture/attack
    // incoming counts by defenseRate.
    if (hostileArrival && target.nodeType === 'tower') {
      const def = this.content.nodeTypes[target.nodeType];
      const lv = def?.levels.find((l) => l.level === target.level);
      const defenseRate = lv?.defenseRate ?? 0;
      if (defenseRate > 0) {
        effectiveCount = effectiveCount / defenseRate;
      }
    }

    // Step 1c (v2.8.0): defender's archetype `incomingDamageMultiplier`
    // buff (e.g., Knight 0.3×). Only applies when defender is OWNED by a
    // player with the archetype; neutrals don't carry one.
    if (hostileArrival && target.ownerId !== null) {
      const defenderPlayer = world.players.find((p) => p.id === target.ownerId);
      if (defenderPlayer) {
        const arch = this.content.archetypes[defenderPlayer.archetype];
        if (arch && arch.buff.type === 'incomingDamageMultiplier') {
          effectiveCount *= arch.buff.value;
        }
      }
    }

    if (effectiveCount <= 0) return;

    // Step 2: friendly arrival — top up. ProductionSystem drains
    // overflow at 1 unit/sec.
    if (target.ownerId !== null && target.ownerId === ug.ownerId) {
      target.units = target.units + effectiveCount;
      return;
    }

    // Step 3+: hostile / neutral. Apply capture-cost multiplier from
    // attacker's faction (legacy liquid-era effect) AND from attacker's
    // archetype (v2.8.0 — e.g., Archer 0.7×).
    let attackPower = effectiveCount;
    if (sourceFaction) {
      const captureCostMult = effectValueForFaction(sourceFaction, 'captureCostMultiplier');
      if (captureCostMult > 0) attackPower = attackPower / captureCostMult;
    }
    const attackerPlayer = world.players.find((p) => p.id === ug.ownerId);
    if (attackerPlayer) {
      const arch = this.content.archetypes[attackerPlayer.archetype];
      if (arch && arch.buff.type === 'captureCostMultiplier' && arch.buff.value > 0) {
        attackPower = attackPower / arch.buff.value;
      }
    }

    target.units -= attackPower;

    if (target.units > 0) {
      // Defender holds.
      return;
    }

    // Ownership flips. Don't clamp the remainder to maxUnits —
    // ProductionSystem will drain any overflow at 1 unit/sec.
    const remaining = -target.units;
    target.ownerId = ug.ownerId;
    target.units = remaining;
    target.faction = ug.sourceFaction;
    target.spellQueue = null;
    target.starveStacks = [];
    target.productionProgress = 0;
    target.isFrozen = false;
    target.frozenUntilTick = 0;
  }
}
