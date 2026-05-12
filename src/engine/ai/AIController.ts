// AIController — drives one AI player. Ticked from inside GameEngine.tick().
// Decisions only fire on a fixed interval; in between ticks the AI is idle.
//
// v2.7: dispatches StrategyDecision discriminated union — send / upgrade /
// concoct / cast. First non-null decision from the personality's strategy
// chain wins; controller schedules the next decision tick afterward.

import type { GameEngine } from '../GameEngine';
import type { Player } from '../World';
import type { AIPersonalityDef } from '../content/ContentLibrary';
import { TICK_MS } from '../../types';
import type { Strategy } from './strategies/BaseStrategy';
import { DumbStrategy } from './strategies/DumbStrategy';
import { UpgradeStrategy } from './strategies/UpgradeStrategy';
import { ConcoctStrategy } from './strategies/ConcoctStrategy';
import { SpellCastStrategy } from './strategies/SpellCastStrategy';
import { VultureStrategy } from './strategies/VultureStrategy';

const STRATEGY_TABLE: Record<string, Strategy> = {
  DumbStrategy,
  UpgradeStrategy,
  ConcoctStrategy,
  SpellCastStrategy,
  VultureStrategy,
};

export class AIController {
  private nextDecisionTick: number;

  constructor(
    private readonly playerId: string,
    private readonly personality: AIPersonalityDef,
  ) {
    this.nextDecisionTick = Math.ceil(personality.decisionIntervalMs / TICK_MS);
  }

  tick(engine: GameEngine): void {
    if (engine.world.tick < this.nextDecisionTick) return;

    const me: Player | undefined = engine.world.players.find((p) => p.id === this.playerId);
    if (!me) return;

    for (const stratId of this.personality.strategies) {
      const strat = STRATEGY_TABLE[stratId];
      if (!strat) continue;
      const decision = strat.decide(engine.world, me, this.personality, engine.content);
      if (!decision) continue;

      switch (decision.kind) {
        case 'send':
          engine.sendUnits(decision.fromNodeIds, decision.toNodeId, decision.fraction);
          break;
        case 'upgrade':
          engine.upgradeNode(decision.nodeId, decision.targetType);
          break;
        case 'concoct':
          engine.startConcoction(decision.labNodeId, decision.spellId);
          break;
        case 'cast':
          engine.castSpell(decision.labNodeId, decision.targetNodeId);
          break;
      }
      break;
    }

    const intervalTicks = Math.max(1, Math.ceil(this.personality.decisionIntervalMs / TICK_MS));
    this.nextDecisionTick = engine.world.tick + intervalTicks;
  }
}
