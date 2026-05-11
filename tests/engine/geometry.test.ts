import { describe, it, expect } from 'vitest';
import {
  segmentsCross,
  segmentBlockedByWalls,
  distPointToSegment,
  pointNearWall,
} from '../../src/engine/geometry';
import type { Wall } from '../../src/engine/entities/Wall';

const p = (x: number, y: number) => ({ x, y });

describe('segmentsCross', () => {
  it('detects crossing X-pattern', () => {
    expect(segmentsCross(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
  });
  it('parallel non-overlapping segments do not cross', () => {
    expect(segmentsCross(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBe(false);
  });
  it('endpoint-only contact is NOT crossing', () => {
    // T-junction: (0,0)-(10,0) and (10,0)-(10,10) share endpoint only.
    expect(segmentsCross(p(0, 0), p(10, 0), p(10, 0), p(10, 10))).toBe(false);
  });
  it('disjoint segments do not cross', () => {
    expect(segmentsCross(p(0, 0), p(5, 5), p(100, 100), p(110, 110))).toBe(false);
  });
});

describe('segmentBlockedByWalls', () => {
  const wallV: Wall = { id: 'w', points: [p(50, 0), p(50, 100)] };
  it('horizontal segment crossing a vertical wall is blocked', () => {
    expect(segmentBlockedByWalls(p(0, 50), p(100, 50), [wallV])).toBe(true);
  });
  it('segment that misses the wall passes', () => {
    expect(segmentBlockedByWalls(p(0, 200), p(100, 200), [wallV])).toBe(false);
  });
});

describe('distPointToSegment', () => {
  it('perpendicular distance to a horizontal segment', () => {
    expect(distPointToSegment(p(5, 4), p(0, 0), p(10, 0))).toBe(4);
  });
  it('past-endpoint distance falls back to endpoint distance', () => {
    expect(distPointToSegment(p(-3, 0), p(0, 0), p(10, 0))).toBe(3);
  });
});

describe('pointNearWall', () => {
  const wall: Wall = { id: 'w', points: [p(50, 0), p(50, 100)] };
  it('point on a wall is near', () => {
    expect(pointNearWall(p(50, 50), [wall], 1)).toBe(true);
  });
  it('point far from walls is not near', () => {
    expect(pointNearWall(p(0, 50), [wall], 10)).toBe(false);
  });
});
