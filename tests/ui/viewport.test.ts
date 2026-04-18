import { describe, it, expect } from 'vitest';
import { ViewportComponent } from '../../src/ui/viewport';

describe('ViewportComponent', () => {
  it('renders without error', () => {
    expect(() => {
      new ViewportComponent();
    }).not.toThrow();
  });

  it('has mount method', () => {
    const component = new ViewportComponent();
    expect(typeof component.mount).toBe('function');
  });

  it('has unmount method', () => {
    const component = new ViewportComponent();
    expect(typeof component.unmount).toBe('function');
  });
});
