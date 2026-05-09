// GameEngine — owns World, runs the deterministic 60Hz tick (§3.1, §8).
// Engine code remains pure TS: no PIXI, no DOM, no React. (§2 hard rule.)

import { TICK_MS, type LiquidId, type NodeId, type NodeTypeId } from '../types';
import type { ContentLibrary, LevelDef } from './content/ContentLibrary';
import { effectValueForLiquid } from './effects/EffectRegistry';
import { registerCoreEffects } from './effects/registerCoreEffects';
import { buildWorldFromLevel, type World } from './World';
import { pathTotalDistance, vec2Distance } from './path';
import { ProductionSystem } from './systems/ProductionSystem';
import { MovementSystem } from './systems/MovementSystem';
import { CombatSystem } from './systems/CombatSystem';
import { WinConditionSystem } from './systems/WinConditionSystem';
import type { UnitGroup } from './entities/UnitGroup';
import { AIController } from './ai/AIController';

export interface System {
  update(world: World, dtMs: number): void;
}

export type SendResult =
  | { ok: true; groupsCreated: number }
  | { ok: false; reason: string };

const BASE_UNIT_SPEED_PX_PER_MS = 0.12; // ~120px/sec — Phase 1 baseline.

export class GameEngine {
  readonly world: World;
  readonly systems: System[];
  readonly content: ContentLibrary;
  readonly ais: AIController[];

  constructor(level: LevelDef, content: ContentLibrary, seed = 1) {
    registerCoreEffects();
    this.content = content;
    this.world = buildWorldFromLevel(level, content, seed);
    this.systems = [
      new ProductionSystem(content),
      new MovementSystem(),
      new CombatSystem(content),
      new WinConditionSystem(),
    ];
    this.ais = [];
    for (const p of this.world.players) {
      if (p.type !== 'ai' || !p.aiConfigId) continue;
      const personality = content.ai[p.aiConfigId];
      if (!personality) {
        throw new Error(`AI player '${p.id}' references unknown personality '${p.aiConfigId}'`);
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

      const path = [
        { ...source.position },
        { ...target.position },
      ];
      const totalDistance = pathTotalDistance(path);
      if (totalDistance === 0) continue;

      const baseSpeed = this.computeSpeedForSource(source.nodeType, source.liquidType);
      const ticksToArrive = Math.max(1, Math.ceil(totalDistance / (baseSpeed * TICK_MS)));

      const ug: UnitGroup = {
        id: `ug${this.world.nextUnitGroupId++}`,
        ownerId: source.ownerId,
        count: sendCount,
        sourceLiquid: source.liquidType,
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

  private computeSpeedForSource(nodeType: NodeTypeId, liquidId: LiquidId): number {
    const typeDef = this.content.nodeTypes[nodeType];
    let speed = BASE_UNIT_SPEED_PX_PER_MS;

    // Tower send penalty (§20 item 3) — irrelevant in Phase 1 but the multiplier
    // is honored so Phase 2 doesn't have to touch this code.
    if (typeDef?.sendSpeedPenalty !== undefined) {
      speed *= typeDef.sendSpeedPenalty;
    }

    const liquid = this.content.liquids[liquidId];
    if (liquid) {
      speed *= effectValueForLiquid(liquid, 'travelSpeedMultiplier');
    }
    return speed;
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
