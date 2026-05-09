// InputController — translates DOM events on the PIXI canvas into engine
// commands and rendering hints. Does NOT mutate world state directly. (§9.2)
//
// Phase 0: just emits world-space click coordinates. Hit-testing against
// world.nodes and gesture machinery (drag, box-select, double-click) lands
// in Phase 1 once nodes exist.

export interface InputCallbacks {
  onClick(worldX: number, worldY: number): void;
}

export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: InputCallbacks;
  private readonly handlePointerDown: (e: PointerEvent) => void;
  private readonly handleContextMenu: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.handlePointerDown = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.callbacks.onClick(x, y);
    };

    this.handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }
}
