import type { ColorScheme } from '../color/scheme';
import type { Renderer, RenderContext, CellContributor, Frame } from '../renderers/types';
import type { SignalName, Payload } from '../signals/catalog';
import type { Handler, SubscribeOptions, Subscription, Registration, ManifoldState, BusContext } from './types';
import { SignalBus } from './signal-bus';
import { RenderPipeline } from './render-pipeline';
import { createRenderContext } from './context';
import { createManifoldState } from './manifold-state';

export interface ApplicatorInit {
  seed: Uint8Array;
  scheme: ColorScheme;
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  renderer: Renderer;
}

export interface FrameRecorder {
  record(frameIndex: number, elapsed: number, cells: Frame): void;
}

export class Applicator {
  private bus: SignalBus;
  private pipeline: RenderPipeline;
  private ctx: RenderContext;
  private manifold: ManifoldState;
  private renderer: Renderer;
  private seed: Uint8Array;
  private recorder: FrameRecorder | null = null;
  private frameIndex = 0;
  private lastElapsed = 0;
  private booted = false;

  constructor(init: ApplicatorInit) {
    this.seed = init.seed;
    this.renderer = init.renderer;
    this.bus = new SignalBus();
    this.pipeline = new RenderPipeline(init.rows, init.cols);
    this.ctx = createRenderContext(init);
    this.manifold = createManifoldState(init.seed);
    const busContext: BusContext = {
      emit: (name, payload) => this.bus.emit(name, payload),
      manifold: this.manifold,
      frame: null,
    };
    this.bus.setContext(busContext);
  }

  on<K extends SignalName>(name: K, handler: Handler<K>, opts?: SubscribeOptions): Subscription {
    return this.bus.on(name, handler, opts);
  }
  off(sub: Subscription): void { this.bus.off(sub); }
  emit<K extends SignalName>(name: K, payload: Payload<K>): void { this.bus.emit(name, payload); }

  registerCellContributor(name: string, fn: CellContributor, opts?: { priority?: number }): Registration {
    return this.pipeline.registerCellContributor(name, fn, opts);
  }
  unregister(reg: Registration): void { this.pipeline.unregister(reg); }

  context(): RenderContext { return this.ctx; }
  manifoldState(): ManifoldState { return this.manifold; }

  boot(): void {
    if (this.booted) return;
    this.renderer.init(this.ctx);
    this.bus.emit('init',        { seed: this.seed });
    this.bus.emit('buildFields', {});
    this.bus.emit('fieldsReady', {});
    this.bus.emit('buildMask',   {});
    this.bus.emit('maskReady',   {});
    this.booted = true;
  }

  tickFrame(elapsed: number): void {
    const dt = elapsed - this.lastElapsed;
    this.ctx.frame.elapsed = elapsed;
    this.ctx.frame.dt = dt;
    this.ctx.frame.timePhase = (elapsed / 800) * Math.PI * 2;
    const busCtx: BusContext = {
      emit: (name, payload) => this.bus.emit(name, payload),
      manifold: this.manifold,
      frame: this.ctx.frame,
    };
    this.bus.setContext(busCtx);
    this.bus.emit('frameBegin', { elapsed, dt });
    const frame = this.pipeline.produceFrame(this.ctx);
    if (this.recorder) this.recorder.record(this.frameIndex, elapsed, frame);
    this.renderer.drawFrame(frame, this.ctx);
    this.bus.emit('postRender', { elapsed });
    this.bus.emit('frameEnd',   { elapsed });
    this.frameIndex++;
    this.lastElapsed = elapsed;
  }

  setRecorder(r: FrameRecorder | null): void { this.recorder = r; }

  dispose(): void { this.renderer.dispose(); }

  __inspect(): { subscriptions: Record<string, number>; contributors: Array<{ name: string; priority: number }> } {
    return {
      subscriptions: this.bus.__subscriptionCounts(),
      contributors:  this.pipeline.__inspect(),
    };
  }
}
