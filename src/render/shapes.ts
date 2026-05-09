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
  // Slightly grow with level so higher-tier nodes feel chunkier without
  // changing pip rules. Values pulled to feel-good defaults; can move to
  // content JSON later if rebalanced.
  const baseByType: Record<NodeTypeId, number> = {
    house: 48,
    barracks: 56,
    lab: 60,
    tower: 60,
  };
  const base = baseByType[type];
  const size = base + (level - 1) * 4;
  return { size, cornerRadius: 8, kind: shapeKindForType(type) };
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
