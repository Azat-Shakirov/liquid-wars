// SelectionBoxView — dashed rectangle drawn while the user is box-selecting.

import { Graphics } from 'pixi.js';
import type { BoxSelectState } from '../SessionState';

export class SelectionBoxView {
  readonly graphic: Graphics;

  constructor() {
    this.graphic = new Graphics();
  }

  update(state: BoxSelectState | null): void {
    this.graphic.clear();
    if (!state) return;
    const x = Math.min(state.start.x, state.current.x);
    const y = Math.min(state.start.y, state.current.y);
    const w = Math.abs(state.current.x - state.start.x);
    const h = Math.abs(state.current.y - state.start.y);
    if (w < 1 || h < 1) return;
    this.graphic
      .rect(x, y, w, h)
      .fill({ color: 0x3da9fc, alpha: 0.08 })
      .rect(x, y, w, h)
      .stroke({ color: 0x3da9fc, width: 1.2, alpha: 0.9 });
  }

  destroy(): void {
    this.graphic.destroy();
  }
}
