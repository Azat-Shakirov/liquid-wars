// GameEngine — owns World, runs the deterministic 60Hz tick. (§3.1, §8)
//
// Phase 0: tick() snapshots previousPosition for entities that exist (none yet)
// then advances world.tick and elapsedMs. Systems list is empty until Phase 1.
//
// HARD RULE (§2): no imports from render/, ui/, input/, or pixi.js. This file
// must run headless in a Node test environment.

import { TICK_MS, type LevelConfig } from '../types';
import { createWorld, type World } from './World';

export interface System {
  update(world: World, dtMs: number): void;
}

export class GameEngine {
  readonly world: World;
  readonly systems: System[];

  constructor(level: LevelConfig, seed = 1) {
    this.world = createWorld(level, seed);
    this.systems = [];
  }

  tick(): void {
    for (const node of this.world.nodes.values()) {
      node.previousPosition = { ...node.position };
    }
    for (const ug of this.world.unitGroups) {
      ug.previousPosition = { ...ug.position };
    }

    for (const sys of this.systems) {
      sys.update(this.world, TICK_MS);
    }

    this.world.tick++;
    this.world.elapsedMs += TICK_MS;
  }
}
