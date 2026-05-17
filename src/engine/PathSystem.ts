// PathSystem — builds the path cache between every ordered pair of
// nodes at level load (§11.5). Visibility-graph + Dijkstra. Runs once;
// not a per-tick system.
//
// Why precomputed: nodes don't move, so per-send A* is wasted work.
// Caching all pairs up front keeps the engine deterministic and the
// per-tick budget predictable.
//
// Determinism: graph point order is fixed (level nodes in nodeOrder,
// then corner waypoints in wall order × vertex order × quadrant order).
// Dijkstra uses a linear scan instead of a heap to avoid id-dependent
// tie-break drift across V8 builds.

import type { NodeId, Vec2 } from '../types';
import type { Wall } from './entities/Wall';
import type { Node } from './entities/Node';
import { segmentBlockedByWalls, pointNearWall, segmentTooCloseToWalls } from './geometry';

// Pathing clearance + buffer are sized per-level from the level's
// computed visualScale. The reasoning:
//
// Path clearance (`pathClearance`) — minimum distance any path segment
// must keep from every wall edge. Catches the "second turn" brush bug:
// segments that don't INTERSECT a wall but pass close enough that the
// rendered unit sprite skims it as the unit returns from a corner
// waypoint toward its destination. Sized from the worst-case unit
// half-width (cavalry, max countScale) at the level's visualScale,
// plus the wall half-width and a small safety margin.
//
// Corner buffer (`cornerBuffer`) — distance from a wall vertex to the
// corresponding visibility-graph corner waypoint. Sized at 1.6× the
// clearance so segments departing/arriving at the waypoint comfortably
// pass the clearance check on the wall vertex they're routing around.
//
// History:
//   v2.7.7 — global CORNER_BUFFER_PX bumped 40 → 56 for v2.7.6 droplet.
//   v2.8.7-followup (first attempt) — bumped to 88 to handle raster
//   sprites, but made the "first turn" arc unnecessarily wide on dense
//   levels (user feedback) AND didn't fix the second-turn brush.
//   v2.8.7-followup (this rewrite) — both buffer and clearance become
//   visualScale-aware, AND segment clearance is enforced on every
//   adjacency edge (not just at waypoint placement).
//
// Cavalry is the widest archetype; its source is 128w × 117h, rendered
// at displayH = 30 * visualScale * countScale. Width = displayH * 128/117,
// halfW = displayH * 64/117. At countScale max (1.5) and visualScale 1.0:
// halfW = 30 * 1.5 * 64/117 ≈ 24.6 px. This is the per-scale-unit
// half-width that drives clearance.
const UNIT_HALFW_AT_SCALE_1 = 24.6;
const WALL_HALF_WIDTH = 3.5;
const SAFETY_MARGIN = 4;

function pathClearance(visualScale: number): number {
  return UNIT_HALFW_AT_SCALE_1 * visualScale + WALL_HALF_WIDTH + SAFETY_MARGIN;
}

function cornerBuffer(visualScale: number): number {
  return pathClearance(visualScale) * 1.6;
}
const QUADRANTS: Array<[number, number]> = [
  [1, -1], // NE
  [1, 1],  // SE
  [-1, 1], // SW
  [-1, -1],// NW
];

export type PathCache = Map<string, Vec2[] | null>;

export function pathCacheKey(fromId: NodeId, toId: NodeId): string {
  return `${fromId}->${toId}`;
}

// Build all-pairs cached paths between level nodes.
//
// Each value is:
//   - a polyline of waypoints (>=2 points: [from.pos, ..., to.pos]) if reachable,
//   - or null if there is no path (target fully walled off).
//
// If walls is empty, every pair gets the trivial [from, to] path and the
// build runs in O(N²) trivially.
export function buildPathCache(
  nodeOrder: NodeId[],
  nodes: Map<NodeId, Node>,
  walls: Wall[],
  // Phase 5: canvas bounds. Corner waypoints outside these bounds are
  // dropped, so units cannot route off-canvas around a wall whose
  // endpoint sits on (or near) the edge — i.e. cannot visibly "pass
  // underneath" a top/bottom wall.
  canvas?: { width: number; height: number },
  // v2.8.7-followup: per-level visualScale drives the path clearance
  // and waypoint corner-buffer. Sparse levels (visualScale 1.5) get
  // wide margins so cavalry doesn't brush wall corners; dense levels
  // (visualScale 1.0, e.g. L012 chokepoint) get tighter clearance so
  // narrow gaps stay traversable. Default 1.0 for callers that pre-
  // date this parameter.
  visualScale: number = 1.0,
): PathCache {
  const CORNER_BUFFER_PX = cornerBuffer(visualScale);
  const SEGMENT_CLEARANCE_PX = pathClearance(visualScale);
  const cache: PathCache = new Map();

  if (walls.length === 0) {
    for (const fromId of nodeOrder) {
      const from = nodes.get(fromId);
      if (!from) continue;
      for (const toId of nodeOrder) {
        if (fromId === toId) continue;
        const to = nodes.get(toId);
        if (!to) continue;
        cache.set(pathCacheKey(fromId, toId), [
          { ...from.position },
          { ...to.position },
        ]);
      }
    }
    return cache;
  }

  // Build visibility-graph points: level nodes first, then corner waypoints.
  // Corner waypoints sit outside the wall by CORNER_BUFFER_PX in each
  // diagonal direction; ones that fall too close to ANY wall edge are
  // dropped so we don't generate waypoints inside a wall's thickness.
  type Point = { pos: Vec2; nodeId: NodeId | null };
  const points: Point[] = [];
  const nodeIndex = new Map<NodeId, number>();

  for (const id of nodeOrder) {
    const n = nodes.get(id);
    if (!n) continue;
    nodeIndex.set(id, points.length);
    points.push({ pos: { ...n.position }, nodeId: id });
  }

  for (const w of walls) {
    for (const v of w.points) {
      for (const [dx, dy] of QUADRANTS) {
        const cand: Vec2 = {
          x: v.x + dx * CORNER_BUFFER_PX,
          y: v.y + dy * CORNER_BUFFER_PX,
        };
        if (pointNearWall(cand, walls, CORNER_BUFFER_PX * 0.5)) continue;
        // Drop corner waypoints outside the canvas bounds — otherwise
        // units route around wall endpoints through off-canvas space
        // (visually "passing underneath" the wall).
        if (canvas !== undefined) {
          if (cand.x < 0 || cand.x > canvas.width) continue;
          if (cand.y < 0 || cand.y > canvas.height) continue;
        }
        points.push({ pos: cand, nodeId: null });
      }
    }
  }

  const V = points.length;

  // Adjacency: for each ordered pair (i,j), edge weight = euclidean
  // distance if the segment is not blocked by any wall, else Infinity.
  const adj: number[][] = Array.from({ length: V }, () => new Array<number>(V).fill(Infinity));
  for (let i = 0; i < V; i++) {
    for (let j = i + 1; j < V; j++) {
      const a = points[i]!.pos;
      const b = points[j]!.pos;
      if (segmentBlockedByWalls(a, b, walls)) continue;
      if (segmentTooCloseToWalls(a, b, walls, SEGMENT_CLEARANCE_PX)) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      adj[i]![j] = d;
      adj[j]![i] = d;
    }
  }

  // Dijkstra from each level-node source. Reconstruct path to each
  // level-node destination.
  for (const fromId of nodeOrder) {
    const srcIdx = nodeIndex.get(fromId);
    if (srcIdx === undefined) continue;

    const dist = new Array<number>(V).fill(Infinity);
    const prev = new Array<number>(V).fill(-1);
    const visited = new Array<boolean>(V).fill(false);
    dist[srcIdx] = 0;

    for (let step = 0; step < V; step++) {
      // Linear scan for the unvisited node with smallest dist.
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < V; i++) {
        if (visited[i]) continue;
        if (dist[i]! < best) {
          best = dist[i]!;
          u = i;
        }
      }
      if (u === -1 || best === Infinity) break;
      visited[u] = true;

      for (let v = 0; v < V; v++) {
        if (visited[v]) continue;
        const w = adj[u]![v]!;
        if (w === Infinity) continue;
        const nd = dist[u]! + w;
        if (nd < dist[v]!) {
          dist[v] = nd;
          prev[v] = u;
        }
      }
    }

    for (const toId of nodeOrder) {
      if (toId === fromId) continue;
      const dstIdx = nodeIndex.get(toId);
      if (dstIdx === undefined) continue;
      const key = pathCacheKey(fromId, toId);
      if (dist[dstIdx] === Infinity) {
        cache.set(key, null);
        continue;
      }
      // Reconstruct, collapsing collinear runs is unnecessary — the
      // movement sampler handles them and the cost is trivial.
      const idxPath: number[] = [];
      let cur = dstIdx;
      while (cur !== -1) {
        idxPath.push(cur);
        if (cur === srcIdx) break;
        cur = prev[cur]!;
      }
      idxPath.reverse();
      cache.set(
        key,
        idxPath.map((i) => ({ ...points[i]!.pos })),
      );
    }
  }

  return cache;
}
