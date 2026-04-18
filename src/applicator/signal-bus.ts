import type { SignalName, Payload } from '../signals/catalog';
import type { BusContext, Handler, SubscribeOptions, Subscription } from './types';
import { CascadeDepthExceeded } from './types';

interface Slot {
  id: number;
  priority: number;
  order: number;
  once: boolean;
  handler: Handler<SignalName>;
  alive: boolean;
}

const DEPTH_LIMIT = 32;

export class SignalBus {
  private slotsBySignal = new Map<SignalName, Slot[]>();
  private nextId = 1;
  private regCounter = 0;
  private context: BusContext | null = null;
  private cascadeStack: SignalName[] = [];

  setContext(ctx: BusContext): void { this.context = ctx; }

  on<K extends SignalName>(name: K, handler: Handler<K>, opts: SubscribeOptions = {}): Subscription {
    const slot: Slot = {
      id: this.nextId++,
      priority: opts.priority ?? 0,
      order: this.regCounter++,
      once: opts.once ?? false,
      handler: handler as Handler<SignalName>,
      alive: true,
    };
    const list = this.slotsBySignal.get(name) ?? [];
    list.push(slot);
    list.sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.slotsBySignal.set(name, list);
    return { id: slot.id, signal: name };
  }

  off(sub: Subscription): void {
    const list = this.slotsBySignal.get(sub.signal);
    if (!list) return;
    for (const s of list) if (s.id === sub.id) { s.alive = false; break; }
  }

  emit<K extends SignalName>(name: K, payload: Payload<K>): void {
    if (this.cascadeStack.length >= DEPTH_LIMIT) {
      throw new CascadeDepthExceeded([...this.cascadeStack, name]);
    }
    if (!this.context) throw new Error('SignalBus.emit called before setContext');
    this.cascadeStack.push(name);
    try {
      const snapshot = (this.slotsBySignal.get(name) ?? []).slice();
      for (const slot of snapshot) {
        if (!slot.alive) continue;
        slot.handler(payload, this.context);
        if (slot.once) slot.alive = false;
      }
      const list = this.slotsBySignal.get(name);
      if (list) {
        const live = list.filter(s => s.alive);
        if (live.length !== list.length) this.slotsBySignal.set(name, live);
      }
    } finally {
      this.cascadeStack.pop();
    }
  }

  __subscriptionCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.slotsBySignal) out[k] = v.filter(s => s.alive).length;
    return out;
  }
}
