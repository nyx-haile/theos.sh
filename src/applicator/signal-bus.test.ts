import { describe, it, expect } from 'vitest';
import { SignalBus } from './signal-bus';
import type { BusContext, ManifoldState } from './types';
import { CascadeDepthExceeded } from './types';

function makeBus(): { bus: SignalBus; ctx: BusContext } {
  const manifold: ManifoldState = { seed: new Uint8Array(32), origin: null, path: [], position: null };
  const bus = new SignalBus();
  const ctx: BusContext = { emit: (n, p) => bus.emit(n, p), manifold, frame: null };
  bus.setContext(ctx);
  return { bus, ctx };
}

describe('SignalBus', () => {
  it('invokes a subscribed handler synchronously', () => {
    const { bus } = makeBus();
    const seen: number[] = [];
    bus.on('frameBegin', p => seen.push(p.elapsed));
    bus.emit('frameBegin', { elapsed: 1, dt: 16 });
    expect(seen).toEqual([1]);
  });

  it('dispatches handlers in priority order (lower first)', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => seen.push('late'),  { priority: 100 });
    bus.on('frameBegin', () => seen.push('mid'),   { priority: 10 });
    bus.on('frameBegin', () => seen.push('early'), { priority: 0 });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['early', 'mid', 'late']);
  });

  it('stable secondary sort on ties (registration order)', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => seen.push('a'), { priority: 5 });
    bus.on('frameBegin', () => seen.push('b'), { priority: 5 });
    bus.on('frameBegin', () => seen.push('c'), { priority: 5 });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('cascades nested emits depth-first', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('init', (_p, ctx) => {
      seen.push('init');
      ctx.emit('buildFields', {});
      seen.push('init-done');
    });
    bus.on('buildFields', () => seen.push('build'));
    bus.emit('init', { seed: new Uint8Array(32) });
    expect(seen).toEqual(['init', 'build', 'init-done']);
  });

  it('throws CascadeDepthExceeded past depth 32', () => {
    const { bus } = makeBus();
    bus.on('init', (_p, ctx) => ctx.emit('init', { seed: new Uint8Array(32) }));
    expect(() => bus.emit('init', { seed: new Uint8Array(32) })).toThrow(CascadeDepthExceeded);
  });

  it('handlers added during emit do not fire for that emission', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => {
      seen.push('first');
      bus.on('frameBegin', () => seen.push('added'));
    });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['first']);
    bus.emit('frameBegin', { elapsed: 1, dt: 1 });
    expect(seen).toEqual(['first', 'first', 'added']);
  });

  it('unsubscribe during emit skips not-yet-called handlers', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => seen.push('A'), { priority: 0 });
    let subC: ReturnType<typeof bus.on>;
    bus.on('frameBegin', () => { seen.push('B'); bus.off(subC); }, { priority: 10 });
    subC = bus.on('frameBegin', () => seen.push('C'), { priority: 20 });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['A', 'B']);
  });

  it('once auto-unsubscribes after first fire', () => {
    const { bus } = makeBus();
    let n = 0;
    bus.on('frameBegin', () => n++, { once: true });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    bus.emit('frameBegin', { elapsed: 1, dt: 1 });
    expect(n).toBe(1);
  });

  it('propagates thrown errors out of emit', () => {
    const { bus } = makeBus();
    bus.on('frameBegin', () => { throw new Error('boom'); });
    expect(() => bus.emit('frameBegin', { elapsed: 0, dt: 0 })).toThrow('boom');
  });
});
