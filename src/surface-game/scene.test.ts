import { describe, it, expect } from 'vitest';
import { createSceneMachine } from './scene';

describe('scene state machine', () => {
  it('starts in title', () => {
    const m = createSceneMachine();
    expect(m.state()).toBe('title');
  });

  it('startDissolve moves to dissolve with startedAt stamped', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    expect(m.state()).toBe('dissolve');
    expect(m.dissolve()).toEqual({ startedAt: 1000, duration: 1500 });
  });

  it('tick(t < startedAt+duration) stays in dissolve', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    m.tick(1500);
    expect(m.state()).toBe('dissolve');
  });

  it('tick(t >= startedAt+duration) transitions to walk', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    m.tick(2500);
    expect(m.state()).toBe('walk');
  });

  it('startDissolve is idempotent while already dissolving', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    m.startDissolve(2000, 500);
    expect(m.dissolve()).toEqual({ startedAt: 1000, duration: 1500 });
  });
});
