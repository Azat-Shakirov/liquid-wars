// 2D geometry helpers — segment intersection + wall-blocking tests.
// Used by PathSystem (visibility graph) and TowerInterceptSystem (LOS).
//
// Determinism note: all math is plain f64 arithmetic, no Math.random,
// no Date.now. Stable across runs given identical inputs.

import type { Vec2 } from '../types';
import type { Wall } from './entities/Wall';
import { wallEdges } from './entities/Wall';

const EPS = 1e-9;

// Standard 2D cross product (z-component).
function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

// Segment-segment intersection. Returns true iff segments (p1,p2) and
// (p3,p4) cross STRICTLY in their interiors — i.e., touching only at
// endpoints (s or t equal to 0 or 1) is NOT considered a crossing.
// This lets paths route to/from points lying on wall endpoints without
// the test reporting blocked. Collinear-overlapping is treated as not
// crossing (extremely unlikely for our level data, and the conservative
// answer for routing).
export function segmentsCross(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
): boolean {
  const r_x = p2.x - p1.x;
  const r_y = p2.y - p1.y;
  const s_x = p4.x - p3.x;
  const s_y = p4.y - p3.y;
  const denom = cross(r_x, r_y, s_x, s_y);
  if (Math.abs(denom) < EPS) return false; // parallel or collinear
  const qmp_x = p3.x - p1.x;
  const qmp_y = p3.y - p1.y;
  const t = cross(qmp_x, qmp_y, s_x, s_y) / denom;
  const u = cross(qmp_x, qmp_y, r_x, r_y) / denom;
  return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
}

// True iff segment (a,b) crosses any wall edge.
export function segmentBlockedByWalls(a: Vec2, b: Vec2, walls: Wall[]): boolean {
  for (const w of walls) {
    for (const [e1, e2] of wallEdges(w)) {
      if (segmentsCross(a, b, e1, e2)) return true;
    }
  }
  return false;
}

// Distance from point p to segment (a,b).
export function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return Math.hypot(px, py);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

// True iff point p is within `tolerance` of any wall edge.
export function pointNearWall(p: Vec2, walls: Wall[], tolerance: number): boolean {
  for (const w of walls) {
    for (const [e1, e2] of wallEdges(w)) {
      if (distPointToSegment(p, e1, e2) <= tolerance) return true;
    }
  }
  return false;
}

// Minimum distance between two line segments.
// 0 if they intersect; otherwise the smallest of the four
// endpoint-to-other-segment distances (which is exact for
// non-intersecting segments in 2D).
export function segmentDistToSegment(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    distPointToSegment(a, c, d),
    distPointToSegment(b, c, d),
    distPointToSegment(c, a, b),
    distPointToSegment(d, a, b),
  );
}

// True iff segment (a,b) passes within `clearance` of any wall edge.
// Different from segmentBlockedByWalls (which only checks INTERSECTION):
// this catches segments that thread past a wall's body or corner so
// close that a unit-sized sprite would visually brush the wall, even
// though the geometric center never crosses it.
export function segmentTooCloseToWalls(
  a: Vec2,
  b: Vec2,
  walls: Wall[],
  clearance: number,
): boolean {
  for (const w of walls) {
    for (const [e1, e2] of wallEdges(w)) {
      if (segmentDistToSegment(a, b, e1, e2) < clearance) return true;
    }
  }
  return false;
}
