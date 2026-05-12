// Tests for v2.7 AI strategies. Strategies are pure functions over
// (world, me, personality, content); we build a GameEngine to obtain a
// realistic world and then exercise the strategy directly.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/engine/GameEngine';
import { makeContent, makeLevel, easyAI } from '../../fixtures/content';
import { UpgradeStrategy } from '../../../src/engine/ai/strategies/UpgradeStrategy';
import { ConcoctStrategy } from '../../../src/engine/ai/strategies/ConcoctStrategy';
import { SpellCastStrategy } from '../../../src/engine/ai/strategies/SpellCastStrategy';
import { VultureStrategy } from '../../../src/engine/ai/strategies/VultureStrategy';
import type { AIPersonalityDef } from '../../../src/engine/content/ContentLibrary';

const content = makeContent();

function withWeights(overrides: Partial<AIPersonalityDef['weights']>): AIPersonalityDef {
  return {
    ...easyAI,
    weights: { ...easyAI.weights, ...overrides },
  };
}

describe('UpgradeStrategy', () => {
  it('returns null when no owned node has enough units to upgrade', () => {
    const level = makeLevel([
      { id: 'n1', position: [200, 200], ownerId: 'ai1', units: 4, type: 'barracks', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ], { aiLiquid: 'water' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = UpgradeStrategy.decide(engine.world, me, easyAI, content);
    expect(d).toBeNull();
  });

  it('upgrades within-type when node is saturated (v2.7.1)', () => {
    // Barracks L1: maxUnits 50, upgradeCost L1→L2 = 5. SATURATION_BUFFER 2
    // so trigger fires at units ≥ 48.
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'ai1', units: 49, type: 'barracks', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ], { aiLiquid: 'water' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = UpgradeStrategy.decide(engine.world, me, easyAI, content);
    expect(d).not.toBeNull();
    expect(d!.kind).toBe('upgrade');
    if (d && d.kind === 'upgrade') {
      expect(d.nodeId).toBe('b1');
      expect(d.targetType).toBeUndefined();
    }
  });

  it('does NOT upgrade when node is not yet saturated', () => {
    // Barracks L1 maxUnits=50, threshold = 48. 40 units < 48 → null.
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'ai1', units: 40, type: 'barracks', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ], { aiLiquid: 'water' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(UpgradeStrategy.decide(engine.world, me, easyAI, content)).toBeNull();
  });

  it('converts House to preferred target (barracks for balanced)', () => {
    // House maxUnits 20; trigger at units ≥ 18. Conversion cost = 5.
    const level = makeLevel([
      { id: 'h1', position: [200, 200], ownerId: 'ai1', units: 19, type: 'house', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ], { aiLiquid: 'water' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = UpgradeStrategy.decide(engine.world, me, easyAI, content);
    expect(d).not.toBeNull();
    if (d && d.kind === 'upgrade') {
      expect(d.nodeId).toBe('h1');
      expect(d.targetType).toBe('barracks'); // easyAI weights default to balanced
    }
  });

  it('converts House to tower when defense weight is high', () => {
    const inkLike = withWeights({ defense: 0.9, spellUse: 0 });
    const level = makeLevel([
      { id: 'h1', position: [200, 200], ownerId: 'ai1', units: 19, type: 'house', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = UpgradeStrategy.decide(engine.world, me, inkLike, content);
    expect(d!.kind).toBe('upgrade');
    if (d && d.kind === 'upgrade') expect(d.targetType).toBe('tower');
  });

  it('converts House to lab when spellUse weight is high', () => {
    const slimeLike = withWeights({ spellUse: 0.9, defense: 0.1 });
    const level = makeLevel([
      { id: 'h1', position: [200, 200], ownerId: 'ai1', units: 19, type: 'house', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = UpgradeStrategy.decide(engine.world, me, slimeLike, content);
    expect(d!.kind).toBe('upgrade');
    if (d && d.kind === 'upgrade') expect(d.targetType).toBe('lab');
  });

  it('skips at max level', () => {
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'ai1', units: 100, type: 'barracks', level: 5 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = UpgradeStrategy.decide(engine.world, me, easyAI, content);
    expect(d).toBeNull();
  });
});

describe('ConcoctStrategy', () => {
  const spellUser = withWeights({ spellUse: 0.9 });

  it('returns null when no Lab is owned', () => {
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 2 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(ConcoctStrategy.decide(engine.world, me, spellUser, content)).toBeNull();
  });

  it('returns null when spellUse weight is zero', () => {
    const level = makeLevel([
      { id: 'l1', position: [200, 200], ownerId: 'ai1', units: 60, type: 'lab', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(ConcoctStrategy.decide(engine.world, me, easyAI, content)).toBeNull();
  });

  it('queues freeze on an idle Lab L1', () => {
    const level = makeLevel([
      { id: 'l1', position: [200, 200], ownerId: 'ai1', units: 60, type: 'lab', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = ConcoctStrategy.decide(engine.world, me, spellUser, content);
    expect(d!.kind).toBe('concoct');
    if (d && d.kind === 'concoct') {
      expect(d.labNodeId).toBe('l1');
      expect(d.spellId).toBe('freeze'); // first in preference, affordable at L1
    }
  });

  it('skips Lab with insufficient units (cost + reserve buffer)', () => {
    // Freeze costs 25; needs 25+5 = 30. Lab with 28 units cannot.
    const level = makeLevel([
      { id: 'l1', position: [200, 200], ownerId: 'ai1', units: 28, type: 'lab', level: 1 },
      { id: 'p1', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(ConcoctStrategy.decide(engine.world, me, spellUser, content)).toBeNull();
  });
});

describe('SpellCastStrategy', () => {
  const spellUser = withWeights({ spellUse: 0.9 });

  it('returns null when no Lab has a ready spell', () => {
    const level = makeLevel([
      { id: 'l1', position: [200, 200], ownerId: 'ai1', units: 60, type: 'lab', level: 1 },
      { id: 't1', position: [600, 200], ownerId: 'p1',  units: 10 },
      { id: 'pp', position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(SpellCastStrategy.decide(engine.world, me, spellUser, content)).toBeNull();
  });

  it('freeze targets the highest-level enemy', () => {
    const level = makeLevel([
      { id: 'l1',  position: [200, 200], ownerId: 'ai1', units: 60, type: 'lab', level: 1 },
      { id: 'eL1', position: [600, 200], ownerId: 'p1',  units: 5,  type: 'barracks', level: 1 },
      { id: 'eL3', position: [700, 200], ownerId: 'p1',  units: 5,  type: 'barracks', level: 3 },
      { id: 'pp',  position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const lab = engine.world.nodes.get('l1')!;
    lab.spellQueue = { spellId: 'freeze', state: 'ready', progress: 1.0 };
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = SpellCastStrategy.decide(engine.world, me, spellUser, content);
    expect(d!.kind).toBe('cast');
    if (d && d.kind === 'cast') expect(d.targetNodeId).toBe('eL3');
  });

  it('recruit targets the weakest enemy node', () => {
    const level = makeLevel([
      { id: 'l1',  position: [200, 200], ownerId: 'ai1', units: 60, type: 'lab', level: 3 },
      { id: 'eH',  position: [600, 200], ownerId: 'p1',  units: 30, type: 'barracks', level: 2 },
      { id: 'eL',  position: [700, 200], ownerId: 'p1',  units: 2,  type: 'barracks', level: 1 },
      { id: 'pp',  position: [50, 50],   ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const lab = engine.world.nodes.get('l1')!;
    lab.spellQueue = { spellId: 'recruit', state: 'ready', progress: 1.0 };
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = SpellCastStrategy.decide(engine.world, me, spellUser, content);
    expect(d!.kind).toBe('cast');
    if (d && d.kind === 'cast') expect(d.targetNodeId).toBe('eL');
  });
});

describe('DumbStrategy expansion cap (v2.7.1)', () => {
  it('returns null when ownedNodes >= maxOwnedNodes', async () => {
    const { DumbStrategy } = await import('../../../src/engine/ai/strategies/DumbStrategy');
    const capped: AIPersonalityDef = {
      ...easyAI,
      thresholds: { ...easyAI.thresholds, maxOwnedNodes: 2 },
    };
    const level = makeLevel([
      { id: 'a1', position: [200, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 1 },
      { id: 'a2', position: [300, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 1 },
      { id: 'e',  position: [600, 200], ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(DumbStrategy.decide(engine.world, me, capped, content)).toBeNull();
  });

  it('still attacks when below the cap', async () => {
    const { DumbStrategy } = await import('../../../src/engine/ai/strategies/DumbStrategy');
    const capped: AIPersonalityDef = {
      ...easyAI,
      thresholds: { ...easyAI.thresholds, maxOwnedNodes: 4 },
    };
    const level = makeLevel([
      { id: 'a1', position: [200, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 1 },
      { id: 'e',  position: [600, 200], ownerId: 'p1',  units: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = DumbStrategy.decide(engine.world, me, capped, content);
    expect(d?.kind).toBe('send');
  });
});

describe('VultureStrategy', () => {
  const vulturePersonality = withWeights({ aggression: 0.8 });

  it('returns null when no target is below the vulture threshold (6 units)', () => {
    const level = makeLevel([
      { id: 's1', position: [200, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 2 },
      { id: 'e1', position: [600, 200], ownerId: 'p1',  units: 15 },
      { id: 'e2', position: [800, 200], ownerId: 'p1',  units: 20 },
    ], { aiLiquid: 'venom' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    expect(VultureStrategy.decide(engine.world, me, vulturePersonality, content)).toBeNull();
  });

  it('strikes a low-unit target', () => {
    const level = makeLevel([
      { id: 's1', position: [200, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 2 },
      { id: 'pp', position: [50, 50],   ownerId: 'p1',  units: 5 },
      { id: 'eL', position: [600, 200], ownerId: 'p1',  units: 3 },
    ], { aiLiquid: 'venom' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = VultureStrategy.decide(engine.world, me, vulturePersonality, content);
    expect(d!.kind).toBe('send');
    if (d && d.kind === 'send') {
      expect(d.toNodeId).toBe('eL');
      expect(d.fromNodeIds).toEqual(['s1']);
    }
  });

  it('prefers neutrals over equally-weak enemies', () => {
    const level = makeLevel([
      { id: 's1', position: [200, 200], ownerId: 'ai1', units: 30 },
      { id: 'pp', position: [50, 50],   ownerId: 'p1',  units: 5 },
      { id: 'eL', position: [600, 200], ownerId: 'p1',  units: 3 },
      { id: 'nL', position: [620, 200], ownerId: null,  units: 3 },
    ], { aiLiquid: 'venom' });
    const engine = new GameEngine(level, content);
    const me = engine.world.players.find((p) => p.id === 'ai1')!;
    const d = VultureStrategy.decide(engine.world, me, vulturePersonality, content);
    expect(d!.kind).toBe('send');
    if (d && d.kind === 'send') expect(d.toNodeId).toBe('nL');
  });
});
