// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { DetailView } from '../../src/game/detail-view';

describe('DetailView', () => {
  it('fetches artifact text and renders it', async () => {
    const client = { fetchArtifactText: vi.fn(async () => '# hello\n\nworld') };
    const { getByTestId } = render(() => <DetailView handle="h1" client={client as any} onClose={() => {}} />);
    await new Promise(r => setTimeout(r, 50));
    expect(getByTestId('detail-view')).toBeTruthy();
    expect(getByTestId('detail-content').textContent).toContain('hello');
    cleanup();
  });

  it('invokes onClose when Escape is pressed', async () => {
    const client = { fetchArtifactText: vi.fn(async () => 'x') };
    const onClose = vi.fn();
    render(() => <DetailView handle="h1" client={client as any} onClose={onClose} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('shows an error line on fetch failure', async () => {
    const client = { fetchArtifactText: vi.fn(async () => { throw new Error('boom'); }) };
    const { getByTestId } = render(() => <DetailView handle="h1" client={client as any} onClose={() => {}} />);
    await new Promise(r => setTimeout(r, 50));
    expect(getByTestId('detail-error').textContent).toMatch(/unable to load/i);
    cleanup();
  });
});
