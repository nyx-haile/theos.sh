import type { SignalName, Payload } from '../signals/catalog';
import type { CellContributor, RenderContext } from '../renderers/types';

export interface Subscription { readonly id: number; readonly signal: SignalName; }
export interface Registration { readonly id: number; readonly name: string; }
export type Disposer = () => void;

export interface SubscribeOptions {
  priority?: number;
  once?:     boolean;
}

export interface ManifoldState {
  readonly seed: Uint8Array;
  origin:   { row: number; col: number } | null;
  path:     string[];
  position: { row: number; col: number } | null;
}

export interface BusContext {
  emit: <K extends SignalName>(name: K, payload: Payload<K>) => void;
  manifold: ManifoldState;
  frame: { elapsed: number; dt: number; timePhase: number } | null;
}

export type Handler<K extends SignalName> = (payload: Payload<K>, ctx: BusContext) => void;

export interface EffectAppLike {
  on<K extends SignalName>(name: K, handler: Handler<K>, opts?: SubscribeOptions): Subscription;
  off(sub: Subscription): void;
  emit<K extends SignalName>(name: K, payload: Payload<K>): void;
  registerCellContributor(name: string, fn: CellContributor, opts?: { priority?: number }): Registration;
  unregister(reg: Registration): void;
  context(): RenderContext;
  manifoldState(): ManifoldState;
}

export interface Effect {
  readonly name: string;
  register(app: EffectAppLike): void;
}

export class CascadeDepthExceeded extends Error {
  constructor(public readonly chain: SignalName[]) {
    super(`Signal cascade exceeded depth limit: ${chain.join(' -> ')}`);
    this.name = 'CascadeDepthExceeded';
  }
}
