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
import { segmentBlockedByWalls, pointNearWall } from './geometry';

const CORNER_BUFFER_PX = 24; // perpendicular offset for corner waypoints
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
): PathCache {
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
