// Wall — a polyline obstacle (Phase 3, §11.5). Each consecutive pair
// of points is one blocking edge. Walls block both unit travel (paths
// route around them) and Tower line-of-sight (intercept beams stop).

import type { Vec2 } from '../../types';

export interface Wall {
  id: string;
  points: Vec2[];
}

export function wallEdges(wall: Wall): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (let i = 1; i < wall.points.length; i++) {
    out.push([wall.points[i - 1]!, wall.points[i]!]);
  }
  return out;
}
