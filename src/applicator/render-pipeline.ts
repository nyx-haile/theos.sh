import type { Registration } from './types';
import type { CellContributor, CellState, Frame, RenderContext } from '../renderers/types';
import { createCellState, resetCellState } from '../renderers/types';

interface Slot {
  id: number;
  name: string;
  priority: number;
  order: number;
  fn: CellContributor;
  alive: boolean;
}

export class RenderPipeline {
  private slots: Slot[] = [];
  private sorted: Slot[] = [];
  private dirty = false;
  private nextId = 1;
  private regCounter = 0;
  private readonly frame: CellState[];

  constructor(public readonly rows: number, public readonly cols: number) {
    this.frame = new Array(rows * cols);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.frame[row * cols + col] = createCellState(row, col);
      }
    }
  }

  registerCellContributor(name: string, fn: CellContributor, opts: { priority?: number } = {}): Registration {
    const slot: Slot = {
      id: this.nextId++, name, priority: opts.priority ?? 0,
      order: this.regCounter++, fn, alive: true,
    };
    this.slots.push(slot);
    this.dirty = true;
    return { id: slot.id, name };
  }

  unregister(reg: Registration): void {
    for (const s of this.slots) if (s.id === reg.id) { s.alive = false; this.dirty = true; break; }
  }

  private ensureSorted(): Slot[] {
    if (!this.dirty) return this.sorted;
    this.sorted = this.slots
      .filter(s => s.alive)
      .slice()
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.dirty = false;
    return this.sorted;
  }

  produceFrame(ctx: RenderContext): Frame {
    const contribs = this.ensureSorted();
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const idx = row * this.cols + col;
        const cell = this.frame[idx]!;
        resetCellState(cell);
        cell.row = row; cell.col = col;
        for (let i = 0; i < contribs.length; i++) contribs[i]!.fn(cell, ctx);
      }
    }
    return this.frame;
  }

  __inspect(): Array<{ name: string; priority: number }> {
    return this.slots.filter(s => s.alive).map(s => ({ name: s.name, priority: s.priority }));
  }
}
