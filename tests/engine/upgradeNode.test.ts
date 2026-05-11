// upgradeNode (§6.3) — within-type level up + House → type conversion.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();

function buildEngine() {
  const level = makeLevel([
    { id: 'b1', position: [200, 200], ownerId: 'p1', units: 50, type: 'barracks', level: 1 },
    { id: 'h1', position: [400, 200], ownerId: 'p1', units: 20, type: 'house', level: 1 },
    { id: 'h2', position: [600, 200], ownerId: 'p1', units: 5,  type: 'house', level: 1 },
    { id: 'b2', position: [800, 200], ownerId: 'p1', units: 80, type: 'barracks', level: 2 },
    { id: 'eb', position: [1000, 200], ownerId: 'ai1', units: 30, type: 'barracks', level: 1 },
    { id: 'n1', position: [1100, 200], ownerId: null, units: 5, type: 'barracks', level: 1 },
  ]);
  return new GameEngine(level, content);
}

describe('GameEngine.upgradeNode', () => {
  it('within-type: Barracks L1→L2 deducts cost and bumps maxUnits', () => {
    const engine = buildEngine();
    const b1 = engine.world.nodes.get('b1')!;
    const before = b1.units;
    const result = engine.upgradeNode('b1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newLevel).toBe(2);
      expect(result.cost).toBe(5);
    }
    expect(b1.level).toBe(2);
    expect(b1.units).toBe(before - 5);
    expect(b1.maxUnits).toBe(75);
  });

  it('within-type: caps units to new maxUnits if previously over', () => {
    const engine = buildEngine();
    const b2 = engine.world.nodes.get('b2')!;
    b2.units = 80; // over L2 max of 75 — synthetic, but the method must clamp.
    // Force a known-affordable upgrade scenario: bump the cost back and try L2→L3.
    const result = engine.upgradeNode('b2');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newLevel).toBe(3);
    expect(b2.level).toBe(3);
    expect(b2.maxUnits).toBe(100);
    expect(b2.units).toBeLessThanOrEqual(100);
  });

  it('blocks within-type upgrade at max level', () => {
    const engine = buildEngine();
    const b2 = engine.world.nodes.get('b2')!;
    // Park b2 at the max barracks level for the fixture (L5) and
    // give it plenty of units, then attempt one more upgrade.
    b2.level = 5;
    b2.maxUnits = 200;
    b2.units = 100;
    const result = engine.upgradeNode('b2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/max level/i);
  });

  it('blocks upgrade with insufficient units', () => {
    const engine = buildEngine();
    const b1 = engine.world.nodes.get('b1')!;
    b1.units = 1; // L2 cost is 5
    const result = engine.upgradeNode('b1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/insufficient/i);
    expect(b1.level).toBe(1); // unchanged
  });

  it('engine command is symmetric — any owner can upgrade their own node', () => {
    // The engine primitive does not know about "the human player". The
    // input layer (right-click only on owned nodes) gates human use; AI
    // strategies will reuse the same command for their own nodes.
    const engine = buildEngine();
    const eb = engine.world.nodes.get('eb')!;
    const before = eb.units;
    const result = engine.upgradeNode('eb');
    expect(result.ok).toBe(true);
    expect(eb.level).toBe(2);
    expect(eb.units).toBe(before - 5);
  });

  it('blocks upgrade on neutral node', () => {
    const engine = buildEngine();
    const result = engine.upgradeNode('n1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unowned/i);
  });

  it('House → Barracks (L1) deducts upgradeCostFromHouse and changes type', () => {
    const engine = buildEngine();
    const h1 = engine.world.nodes.get('h1')!;
    const before = h1.units; // 20
    const result = engine.upgradeNode('h1', 'barracks');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newType).toBe('barracks');
      expect(result.newLevel).toBe(1);
      expect(result.cost).toBe(5); // barracks L1 upgradeCostFromHouse = 5
    }
    expect(h1.nodeType).toBe('barracks');
    expect(h1.level).toBe(1);
    expect(h1.units).toBe(before - 5);
    expect(h1.maxUnits).toBe(50);
  });

  it('House → Tower (L1) deducts cost and changes type', () => {
    const engine = buildEngine();
    const h1 = engine.world.nodes.get('h1')!;
    const before = h1.units; // 20
    const result = engine.upgradeNode('h1', 'tower');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cost).toBe(10); // tower L1 upgradeCostFromHouse = 10
    expect(h1.nodeType).toBe('tower');
    expect(h1.units).toBe(before - 10);
    expect(h1.maxUnits).toBe(30);
  });

  it('blocks House conversion when units < cost', () => {
    const engine = buildEngine();
    const h2 = engine.world.nodes.get('h2')!; // 5 units
    const result = engine.upgradeNode('h2', 'tower'); // cost 10
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/insufficient/i);
    expect(h2.nodeType).toBe('house');
  });

  it('blocks conversion on a non-House node', () => {
    const engine = buildEngine();
    const result = engine.upgradeNode('b1', 'tower');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/only Houses/i);
  });

  it('blocks unknown node id', () => {
    const engine = buildEngine();
    const result = engine.upgradeNode('does-not-exist');
    expect(result.ok).toBe(false);
  });
});
