// Pathfinding helpers. Phase 1: paths are always [from, to] (no walls yet).
// Phase 3 will compute visibility-graph paths and reuse this sampler unchanged.

import type { Vec2 } from '../types';

export function vec2Distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function pathTotalDistance(path: Vec2[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    d += vec2Distance(path[i - 1]!, path[i]!);
  }
  return d;
}

// Sample a position along a polyline at fraction t in [0, 1].
export function sampleAlongPath(path: Vec2[], t: number): Vec2 {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return { ...path[0]! };
  const clamped = Math.max(0, Math.min(1, t));
  const total = pathTotalDistance(path);
  if (total === 0) return { ...path[0]! };
  const target = clamped * total;
  let traveled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = vec2Distance(a, b);
    if (traveled + seg >= target) {
      const local = seg === 0 ? 0 : (target - traveled) / seg;
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
    }
    traveled += seg;
  }
  return { ...path[path.length - 1]! };
}
