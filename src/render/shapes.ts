// Shape geometry constants and helpers shared by NodeView.

import type { NodeTypeId } from '../types';

export type ShapeKind = 'roundedSquare' | 'hexagon' | 'triangle' | 'circle';

export interface ShapeMetrics {
  size: number;        // bounding-box edge in px
  cornerRadius: number;
  kind: ShapeKind;
}

export function shapeKindForType(type: NodeTypeId): ShapeKind {
  switch (type) {
    case 'barracks':
      return 'roundedSquare';
    case 'tower':
      return 'hexagon';
    case 'lab':
      return 'triangle';
    case 'house':
      return 'circle';
  }
}

export function metricsForType(type: NodeTypeId, level: number): ShapeMetrics {
  // v2.7.3: shrunk ~25% from the v2.7 ship sizes (was house 48 / barracks
  // 56 / lab+tower 60) so maps breathe — node-to-node travel takes
  // visibly longer and the player can read the board.
  const baseByType: Record<NodeTypeId, number> = {
    house: 36,
    barracks: 42,
    lab: 45,
    tower: 45,
  };
  const base = baseByType[type];
  const size = base + (level - 1) * 3;
  return { size, cornerRadius: 6, kind: shapeKindForType(type) };
}

export function colorFromHex(hex: string): number {
  // '#a01010' → 0xa01010
  return parseInt(hex.replace('#', ''), 16);
}

// Pointy-top hexagon vertices inscribed in a `size`×`size` bounding box,
// centered at (0,0). Returns a flat [x0,y0,x1,y1,...] array suitable for
// PIXI Graphics.poly().
export function hexagonPoints(size: number): number[] {
  const r = size / 2;
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    // pointy-top: rotate so the first vertex is straight up
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}

// Equilateral triangle inscribed in a `size`×`size` bounding box,
// centered at (0,0), apex pointing up. Returns flat [x0,y0,...] for poly().
export function trianglePoints(size: number): number[] {
  const r = size / 2;
  const pts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (2 * Math.PI / 3) * i - Math.PI / 2;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}
