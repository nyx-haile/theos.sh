// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { keyToOp, attachFixedBindings } from './fixed-bindings';
import type { ManifoldOp } from '../manifold/types';

describe('fixed-bindings', () => {
  it('keyToOp maps WASD/arrows to ViewportOp translate', () => {
    expect(keyToOp('w')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [0, 1, 0] });
    expect(keyToOp('s')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [0, -1, 0] });
    expect(keyToOp('a')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [-1, 0, 0] });
    expect(keyToOp('d')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    expect(keyToOp('ArrowUp')).toEqual(keyToOp('w'));
    expect(keyToOp('ArrowDown')).toEqual(keyToOp('s'));
    expect(keyToOp('ArrowLeft')).toEqual(keyToOp('a'));
    expect(keyToOp('ArrowRight')).toEqual(keyToOp('d'));
  });

  it('keyToOp returns null for unmapped keys', () => {
    expect(keyToOp('q')).toBeNull();
    expect(keyToOp('Enter')).toBeNull();
    expect(keyToOp('Escape')).toBeNull();
  });

  it('attachFixedBindings dispatches on keydown and detaches on cleanup', () => {
    const dispatch = vi.fn<[ManifoldOp], void>();
    const detach = attachFixedBindings(window as unknown as Window, dispatch);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(keyToOp('w'));

    detach();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('attachFixedBindings ignores unmapped keys', () => {
    const dispatch = vi.fn<[ManifoldOp], void>();
    const detach = attachFixedBindings(window as unknown as Window, dispatch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    expect(dispatch).not.toHaveBeenCalled();
    detach();
  });
});
