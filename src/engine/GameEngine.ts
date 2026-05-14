// GameEngine — owns World, runs the deterministic 60Hz tick (§3.1, §8).
// Engine code remains pure TS: no PIXI, no DOM, no React. (§2 hard rule.)

import { TICK_MS, type FactionId, type NodeId, type NodeTypeId, type SpellId } from '../types';
import type { ContentLibrary, LevelDef } from './content/ContentLibrary';
import { effectValueForFaction } from './effects/EffectRegistry';
import { registerCoreEffects } from './effects/registerCoreEffects';
import { buildWorldFromLevel, type World } from './World';
import { pathTotalDistance, vec2Distance } from './path';
import { pathCacheKey } from './PathSystem';
import { ProductionSystem } from './systems/ProductionSystem';
import { SpellConcoctionSystem } from './systems/SpellConcoctionSystem';
import { MovementSystem } from './systems/MovementSystem';
import { TowerInterceptSystem } from './systems/TowerInterceptSystem';
import { CombatSystem } from './systems/CombatSystem';
import { EffectSystem } from './systems/EffectSystem';
import { WinConditionSystem } from './systems/WinConditionSystem';
import type { UnitGroup } from './entities/UnitGroup';
import { AIController } from './ai/AIController';

export interface System {
  update(world: World, dtMs: number): void;
}

export type SendResult =
  | { ok: true; groupsCreated: number }
  | { ok: false; reason: string };

export type UpgradeResult =
  | { ok: true; newType: NodeTypeId; newLevel: number; cost: number }
  | { ok: false; reason: string };

export type SpellResult =
  | { ok: true }
  | { ok: false; reason: string };

const BASE_UNIT_SPEED_PX_PER_MS = 0.09; // ~90px/sec — v2.7.3 pacing slow-down (was 0.12).

export class GameEngine {
  readonly world: World;
  readonly systems: System[];
  readonly content: ContentLibrary;
  readonly ais: AIController[];
  readonly towerInterceptSystem: TowerInterceptSystem;

  constructor(level: LevelDef, content: ContentLibrary, seed = 1) {
    registerCoreEffects();
    this.content = content;
    this.world = buildWorldFromLevel(level, content, seed);
    this.towerInterceptSystem = new TowerInterceptSystem(content);
    this.systems = [
      new ProductionSystem(content),
      new SpellConcoctionSystem(content),
      new MovementSystem(content),
      this.towerInterceptSystem,
      new CombatSystem(content),
      new EffectSystem(),
      new WinConditionSystem(),
    ];
    this.ais = [];
    for (const p of this.world.players) {
      if (p.type !== 'ai') continue;
      // v2.7 auto-select by faction: when the level doesn't specify
      // aiConfigId, use the AI's faction as the personality key (each
      // faction has a matching personality file in content/ai/).
      // Explicit aiConfigId still wins for testing / special cases.
      const configId = p.aiConfigId ?? p.faction;
      const personality = content.ai[configId];
      if (!personality) {
        throw new Error(`AI player '${p.id}' references unknown personality '${configId}'`);
      }
      this.ais.push(new AIController(p.id, personality));
    }
  }

  tick(): void {
    if (this.world.status !== 'playing') return;

    for (const id of this.world.nodeOrder) {
      const n = this.world.nodes.get(id);
      if (n) n.previousPosition = { ...n.position };
    }
    for (const ug of this.world.unitGroups) {
      ug.previousPosition = { ...ug.position };
    }

    for (const ai of this.ais) ai.tick(this);

    for (const sys of this.systems) {
      sys.update(this.world, TICK_MS);
    }

    this.world.tick++;
    this.world.elapsedMs += TICK_MS;
  }

  // ──────────────────────────────────────────────────────────────────
  // Commands (called from input/AI). Mutate world directly via guarded paths.
  // ──────────────────────────────────────────────────────────────────

  sendUnits(fromNodeIds: NodeId[], toNodeId: NodeId, fraction: number): SendResult {
    if (this.world.status !== 'playing') return { ok: false, reason: 'not playing' };
    const target = this.world.nodes.get(toNodeId);
    if (!target) return { ok: false, reason: 'unknown target' };
    const f = Math.max(0, Math.min(1, fraction));
    if (f === 0) return { ok: false, reason: 'zero fraction' };

    let groupsCreated = 0;

    for (const fromId of fromNodeIds) {
      if (fromId === toNodeId) continue;
      const source = this.world.nodes.get(fromId);
      if (!source) continue;
      if (source.ownerId === null) continue;
      if (source.isFrozen) continue;

      const sendCount = Math.floor(source.units * f);
      if (sendCount <= 0) continue;

      const cached = this.world.pathCache.get(pathCacheKey(source.id, target.id));
      if (cached === null) continue; // unreachable — silently drop
      const path = (cached ?? [
        { ...source.position },
        { ...target.position },
      ]).map((p) => ({ x: p.x, y: p.y }));
      const totalDistance = pathTotalDistance(path);
      if (totalDistance === 0) continue;

      const baseSpeed = this.computeSpeedForSource(source.nodeType, source.faction);
      const ticksToArrive = Math.max(1, Math.ceil(totalDistance / (baseSpeed * TICK_MS)));

      const ug: UnitGroup = {
        id: `ug${this.world.nextUnitGroupId++}`,
        ownerId: source.ownerId,
        count: sendCount,
        sourceFaction: source.faction,
        fromNodeId: source.id,
        toNodeId: target.id,
        path,
        pathProgress: 0,
        totalDistance,
        baseSpeed,
        spawnTick: this.world.tick,
        arrivalTick: this.world.tick + ticksToArrive,
        position: { ...source.position },
        previousPosition: { ...source.position },
      };

      source.units -= sendCount;
      this.world.unitGroups.push(ug);
      groupsCreated++;
    }

    return groupsCreated > 0
      ? { ok: true, groupsCreated }
      : { ok: false, reason: 'no eligible source' };
  }

  // Upgrade a node — within-type level up (Barracks 2→3, etc.) or House
  // conversion into Barracks/Lab/Tower at level 1. Cost in units, paid
  // from the node. Instant per §6.3.
  //
  //   targetType undefined  → within-type level up to (current level + 1).
  //   targetType set        → House conversion; only valid on Houses.
  upgradeNode(nodeId: NodeId, targetType?: NodeTypeId): UpgradeResult {
    if (this.world.status !== 'playing') return { ok: false, reason: 'not playing' };
    const node = this.world.nodes.get(nodeId);
    if (!node) return { ok: false, reason: 'unknown node' };
    if (node.ownerId === null) return { ok: false, reason: 'unowned' };
    if (node.isFrozen) return { ok: false, reason: 'frozen' };

    const currentTypeDef = this.content.nodeTypes[node.nodeType];
    if (!currentTypeDef) return { ok: false, reason: 'unknown current type' };

    if (targetType !== undefined && targetType !== node.nodeType) {
      // House conversion path.
      if (node.nodeType !== 'house') return { ok: false, reason: 'only Houses can convert' };
      const allowed = currentTypeDef.upgradeTargets ?? [];
      if (!allowed.includes(targetType)) return { ok: false, reason: 'invalid target type' };
      const targetTypeDef = this.content.nodeTypes[targetType];
      if (!targetTypeDef) return { ok: false, reason: 'unknown target type' };
      const lv1 = targetTypeDef.levels.find((l) => l.level === 1);
      if (!lv1) return { ok: false, reason: 'target has no level 1' };
      const cost = lv1.upgradeCostFromHouse ?? Infinity;
      if (!Number.isFinite(cost)) return { ok: false, reason: 'no upgradeCostFromHouse defined' };
      if (node.units < cost) return { ok: false, reason: 'insufficient units' };

      node.units -= cost;
      node.nodeType = targetType;
      node.level = 1;
      node.maxUnits = lv1.maxUnits;
      // No clamp on conversion — if the new type has a smaller cap,
      // ProductionSystem drains the overflow at 1 unit/sec.
      node.spellQueue = null;
      node.attackCooldownMs = 0;
      return { ok: true, newType: targetType, newLevel: 1, cost };
    }

    // Within-type level up. (maxUnits only goes up across levels of
    // the same type, so no overflow expected; no clamp needed.)
    const nextLevel = node.level + 1;
    const nextLv = currentTypeDef.levels.find((l) => l.level === nextLevel);
    if (!nextLv) return { ok: false, reason: 'already at max level' };
    const cost = nextLv.upgradeCost ?? Infinity;
    if (!Number.isFinite(cost)) return { ok: false, reason: 'no upgradeCost defined' };
    if (node.units < cost) return { ok: false, reason: 'insufficient units' };

    node.units -= cost;
    node.level = nextLevel;
    node.maxUnits = nextLv.maxUnits;
    return { ok: true, newType: node.nodeType, newLevel: nextLevel, cost };
  }

  // ──────────────────────────────────────────────────────────────────
  // Spell commands (§7).
  // ──────────────────────────────────────────────────────────────────

  startConcoction(labNodeId: NodeId, spellId: SpellId): SpellResult {
    if (this.world.status !== 'playing') return { ok: false, reason: 'not playing' };
    const lab = this.world.nodes.get(labNodeId);
    if (!lab) return { ok: false, reason: 'unknown lab' };
    if (lab.nodeType !== 'lab') return { ok: false, reason: 'not a lab' };
    if (lab.ownerId === null) return { ok: false, reason: 'unowned' };
    if (lab.isFrozen) return { ok: false, reason: 'frozen' };
    if (lab.spellQueue !== null) return { ok: false, reason: 'lab busy' };

    const spell = this.content.spells[spellId];
    if (!spell) return { ok: false, reason: 'unknown spell' };
    if (spell.minLabLevel > lab.level) return { ok: false, reason: 'lab level too low' };
    if (lab.units < spell.unitCost) return { ok: false, reason: 'insufficient units' };

    lab.spellQueue = { spellId, state: 'concocting', progress: 0 };
    return { ok: true };
  }

  cancelConcoction(labNodeId: NodeId): SpellResult {
    const lab = this.world.nodes.get(labNodeId);
    if (!lab) return { ok: false, reason: 'unknown lab' };
    if (lab.nodeType !== 'lab') return { ok: false, reason: 'not a lab' };
    if (lab.spellQueue === null) return { ok: false, reason: 'nothing to cancel' };
    lab.spellQueue = null;
    return { ok: true };
  }

  // Casts a 'ready' spell from `labNodeId` onto `targetNodeId`. Pays
  // the unit cost from the lab and applies the effect (§7.2 + §7.3).
  castSpell(labNodeId: NodeId, targetNodeId: NodeId): SpellResult {
    if (this.world.status !== 'playing') return { ok: false, reason: 'not playing' };
    const lab = this.world.nodes.get(labNodeId);
    if (!lab) return { ok: false, reason: 'unknown lab' };
    if (lab.nodeType !== 'lab') return { ok: false, reason: 'not a lab' };
    if (lab.ownerId === null) return { ok: false, reason: 'unowned' };
    if (lab.isFrozen) return { ok: false, reason: 'lab frozen' };
    if (!lab.spellQueue || lab.spellQueue.state !== 'ready') {
      return { ok: false, reason: 'spell not ready' };
    }

    const spell = this.content.spells[lab.spellQueue.spellId];
    if (!spell) {
      lab.spellQueue = null;
      return { ok: false, reason: 'unknown spell' };
    }
    if (lab.units < spell.unitCost) {
      // Cost-violation drop, same as SpellConcoctionSystem would do.
      lab.spellQueue = null;
      return { ok: false, reason: 'insufficient units' };
    }

    const target = this.world.nodes.get(targetNodeId);
    if (!target) return { ok: false, reason: 'unknown target' };

    // Apply effect.
    switch (spell.effect.type) {
      case 'freeze': {
        // Freeze (per user spec patch): pure neutralization. Target
        // becomes neutral; units preserved. Recruit-but-to-neutral.
        // Cancels target's concoction since neutral nodes don't concoct.
        target.ownerId = null;
        target.spellQueue = null;
        target.productionProgress = 0;
        break;
      }
      case 'starve': {
        // v2.8.0 — renamed from bleed; mechanic identical to v2.7 bleed
        // (no time expiry — drains until enemy capture). Stops
        // production (handled in ProductionSystem) and drains
        // drainPerSecond units/sec (handled in EffectSystem).
        // CombatSystem clears stacks on hostile capture.
        target.starveStacks.push({
          sourcePlayerId: lab.ownerId,
          drainPerSecond: spell.effect.params.drainPerSecond,
        });
        break;
      }
      case 'sabotage': {
        // v2.8.0 — renamed from recruit; mechanic unchanged. Target
        // flips to caster; units preserved; ends starve; cancels
        // target's concoction.
        target.ownerId = lab.ownerId;
        target.spellQueue = null;
        target.starveStacks = [];
        break;
      }
    }

    // Pay cost from the Lab.
    lab.units -= spell.unitCost;
    lab.spellQueue = null;
    return { ok: true };
  }

  private computeSpeedForSource(nodeType: NodeTypeId, factionId: FactionId): number {
    const typeDef = this.content.nodeTypes[nodeType];
    let speed = BASE_UNIT_SPEED_PX_PER_MS;

    // Tower send penalty (§20 item 3) — irrelevant in Phase 1 but the multiplier
    // is honored so Phase 2 doesn't have to touch this code.
    if (typeDef?.sendSpeedPenalty !== undefined) {
      speed *= typeDef.sendSpeedPenalty;
    }

    const faction = this.content.factions[factionId];
    if (faction) {
      speed *= effectValueForFaction(faction, 'travelSpeedMultiplier');
    }
    return speed;
  }

  // Phase 3 — returns the cached path polyline from one node to another,
  // or null if the pair is unreachable (target fully walled off).
  // Used by the renderer for hover-preview lines.
  getPath(fromId: NodeId, toId: NodeId): { x: number; y: number }[] | null {
    if (fromId === toId) return null;
    const cached = this.world.pathCache.get(pathCacheKey(fromId, toId));
    if (cached === undefined) {
      const a = this.world.nodes.get(fromId);
      const b = this.world.nodes.get(toId);
      if (!a || !b) return null;
      return [{ ...a.position }, { ...b.position }];
    }
    if (cached === null) return null;
    return cached.map((p) => ({ x: p.x, y: p.y }));
  }

  // Helper for hit-testing in input layer — returns nearest node to a point
  // within `radius` px, or null. Lives here so input doesn't have to know
  // about node geometry.
  pickNodeAt(x: number, y: number, radius = 36): NodeId | null {
    let best: { id: NodeId; d: number } | null = null;
    for (const id of this.world.nodeOrder) {
      const n = this.world.nodes.get(id);
      if (!n) continue;
      const d = vec2Distance({ x, y }, n.position);
      if (d <= radius && (!best || d < best.d)) {
        best = { id, d };
      }
    }
    return best ? best.id : null;
  }
}
