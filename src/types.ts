// Shared types used across engine, render, and input layers.

export type NodeId = string;
export type PlayerId = string;
export type LiquidId = string;
export type NodeTypeId = 'house' | 'barracks' | 'lab' | 'tower';
export type SpellId = string;
export type UnitGroupId = string;

export interface Vec2 {
  x: number;
  y: number;
}

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

// Phase 0 stub. Full level format in §11 — populated in Phase 1.
export interface LevelConfig {
  id: number;
  name: string;
  width: number;
  height: number;
}
