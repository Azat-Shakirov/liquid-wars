// Pure function — fast, no DOM, no Vitest environment override needed.

import { describe, it, expect } from 'vitest';
import { resolveClick } from '../../src/input/clickResolver';
import { buildWorldFromLevel } from '../../src/engine/World';
import { registerCoreEffects } from '../../src/engine/effects/registerCoreEffects';
import { makeContent, makeLevel } from '../fixtures/content';

registerCoreEffects();

const content = makeContent();

// Three-node sandbox: two human-owned, one enemy.
const level = makeLevel([
  { id: 'h1', position: [100, 100], ownerId: 'p1', units: 30 },
  { id: 'h2', position: [200, 100], ownerId: 'p1', units: 30 },
  { id: 'e1', position: [400, 100], ownerId: 'ai1', units: 20 },
  { id: 'n1', position: [400, 300], ownerId: null, units: 5 },
]);
const world = buildWorldFromLevel(level, content);

const sel = (...ids: string[]) => new Set(ids);

describe('resolveClick', () => {
  it('clicking empty space clears the selection', () => {
    const action = resolveClick(world, sel('h1'), null, false, false);
    expect(action).toEqual({ kind: 'clear-selection' });
  });

  it('clicking an unknown node id is a no-op', () => {
    const action = resolveClick(world, sel('h1'), 'nonexistent', false, false);
    expect(action).toEqual({ kind: 'noop' });
  });

  it('plain click on owned node is select-replace', () => {
    const action = resolveClick(world, sel(), 'h1', false, false);
    expect(action).toEqual({ kind: 'select-replace', nodeId: 'h1' });
  });

  it('shift-click on owned node is select-toggle', () => {
    const action = resolveClick(world, sel(), 'h1', true, false);
    expect(action).toEqual({ kind: 'select-toggle', nodeId: 'h1' });
  });

  it('single-select + click on hostile is no-op (drag still required)', () => {
    const action = resolveClick(world, sel('h1'), 'e1', false, false);
    expect(action).toEqual({ kind: 'noop' });
  });

  it('single-select + click on neutral is no-op (drag still required)', () => {
    const action = resolveClick(world, sel('h1'), 'n1', false, false);
    expect(action).toEqual({ kind: 'noop' });
  });

  it('multi-select + click on hostile sends 50% from full selection', () => {
    const action = resolveClick(world, sel('h1', 'h2'), 'e1', false, false);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') {
      expect(action.fraction).toBe(0.5);
      expect(action.target).toBe('e1');
      expect(action.sources.sort()).toEqual(['h1', 'h2']);
    }
  });

  it('multi-select + click on neutral sends 50%', () => {
    const action = resolveClick(world, sel('h1', 'h2'), 'n1', false, false);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') expect(action.fraction).toBe(0.5);
  });

  it('multi-select + double-click on hostile sends 100%', () => {
    const action = resolveClick(world, sel('h1', 'h2'), 'e1', false, true);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') {
      expect(action.fraction).toBe(1.0);
      expect(action.sources.sort()).toEqual(['h1', 'h2']);
    }
  });

  it('single-select + double-click on hostile sends 100% from that one source', () => {
    const action = resolveClick(world, sel('h1'), 'e1', false, true);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') {
      expect(action.fraction).toBe(1.0);
      expect(action.sources).toEqual(['h1']);
      expect(action.target).toBe('e1');
    }
  });

  it('double-click without any selection is no-op (no sources)', () => {
    const action = resolveClick(world, sel(), 'e1', false, true);
    expect(action).toEqual({ kind: 'noop' });
  });

  it('double-click excludes the target itself from sources', () => {
    // Defensive: shouldn't normally happen since hostile/neutral can't be
    // in selection, but if it ever did, the target shouldn't send to itself.
    const action = resolveClick(world, sel('h1', 'e1'), 'e1', false, true);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') {
      expect(action.sources).toEqual(['h1']);
    }
  });

  it('multi-select + click on a SELECTED own node redistributes 50% from others', () => {
    const action = resolveClick(world, sel('h1', 'h2'), 'h1', false, false);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') {
      expect(action.fraction).toBe(0.5);
      expect(action.target).toBe('h1');
      expect(action.sources).toEqual(['h2']);
    }
  });

  it('multi-select + double-click on a SELECTED own node redistributes 100%', () => {
    const action = resolveClick(world, sel('h1', 'h2'), 'h1', false, true);
    expect(action.kind).toBe('send');
    if (action.kind === 'send') {
      expect(action.fraction).toBe(1.0);
      expect(action.target).toBe('h1');
      expect(action.sources).toEqual(['h2']);
    }
  });

  it('single-select + click on the only selected own node is a no-op', () => {
    // Narrowing-by-click is dropped: clicking the one selected node
    // does nothing (selection unchanged).
    const action = resolveClick(world, sel('h1'), 'h1', false, false);
    expect(action).toEqual({ kind: 'noop' });
  });

  it('shift-click on owned with multi-select toggles', () => {
    const action = resolveClick(world, sel('h1', 'h2'), 'h1', true, false);
    expect(action).toEqual({ kind: 'select-toggle', nodeId: 'h1' });
  });
});
