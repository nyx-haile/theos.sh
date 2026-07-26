import { describe, expect, it } from 'vitest';
import { renderScribe, MAX_SCRIBE_TOKENS } from './render';
import { tokenizeScribeText } from './tokens';

const SEED = Uint8Array.from({ length: 32 }, (_, index) => index * 7);

function render(text: string, overrides: Partial<Parameters<typeof renderScribe>[0]> = {}) {
  return renderScribe({
    tokens: tokenizeScribeText(text, 'test'),
    seed: SEED,
    pxPerEm: 96,
    maxWidth: 4096,
    quality: 'full',
    ...overrides,
  });
}

describe('Scribe motor renderer', () => {
  it('is byte-deterministic for the same immutable score', () => {
    const first = render('theos.sh');
    const second = render('theos.sh');
    expect(first.sampleCount).toBeGreaterThan(200);
    expect(first.strokes.map((stroke) => [...stroke.mesh.positions])).toEqual(
      second.strokes.map((stroke) => [...stroke.mesh.positions]),
    );
    expect(first.strokes.map((stroke) => [...stroke.mesh.indices])).toEqual(
      second.strokes.map((stroke) => [...stroke.mesh.indices]),
    );
  });

  it('renders the full proof alphabet with a caret and envelope for every token', () => {
    const text = 'ehlost. ';
    const run = render(text);
    expect(run.carets).toHaveLength(text.length + 1);
    expect(run.selectionEnvelopes).toHaveLength(text.length);
    expect(run.selectionEnvelopes.at(-1)!.kind).toBe('advance');
    expect(run.selectionEnvelopes.slice(0, -1).every((envelope) => envelope.kind === 'ink')).toBe(true);
    expect(run.carets.map((caret) => caret.sourceOffset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('draws a visible, owned missing-character sign instead of dropping source text', () => {
    const run = render('E!');
    expect(run.selectionEnvelopes).toHaveLength(2);
    expect(run.selectionEnvelopes.every((envelope) => envelope.kind === 'ink')).toBe(true);
    expect(run.strokes.flatMap((stroke) => stroke.points)
      .some((point) => point.owners.includes('test:0'))).toBe(true);
    expect(run.strokes.flatMap((stroke) => stroke.points)
      .some((point) => point.owners.includes('test:1'))).toBe(true);
  });

  it('uses fixed 120 Hz and 60 Hz motor steps and enforces proof budgets', () => {
    const full = render('el', { quality: 'full' });
    const lite = render('el', { quality: 'lite' });
    expect(full.sampleCount).toBeGreaterThan(lite.sampleCount);
    const fullTimes = full.strokes[0]!.points.slice(0, 4).map((point) => point.time);
    const liteTimes = lite.strokes[0]!.points.slice(0, 4).map((point) => point.time);
    expect(fullTimes[2]! - fullTimes[1]!).toBeCloseTo(1 / 120, 10);
    expect(liteTimes[2]! - liteTimes[1]!).toBeCloseTo(1 / 60, 10);
    expect(() => renderScribe({
      tokens: tokenizeScribeText(' '.repeat(MAX_SCRIBE_TOKENS + 1)),
      seed: SEED,
      pxPerEm: 40,
      maxWidth: 1000,
      quality: 'lite',
    })).toThrow(/at most 64/);
    for (const grapheme of ['e', 'h', 'l', 'o', 's', 't', '.', '!']) {
      const worstProof = render(grapheme.repeat(MAX_SCRIBE_TOKENS), {
        maxWidth: Number.POSITIVE_INFINITY,
      });
      expect(worstProof.sampleCount).toBeLessThanOrEqual(4096);
      expect(worstProof.selectionEnvelopes).toHaveLength(MAX_SCRIBE_TOKENS);
      expect(new Set(worstProof.strokes.flatMap((stroke) => (
        stroke.points.flatMap((point) => point.owners)
      ))).size).toBe(MAX_SCRIBE_TOKENS);
    }

    const mixedProof = render('ehlost.!'.repeat(8), {
      maxWidth: Number.POSITIVE_INFINITY,
    });
    expect(mixedProof.sampleCount).toBeLessThanOrEqual(4096);
    expect(mixedProof.carets).toHaveLength(MAX_SCRIBE_TOKENS + 1);
    expect(mixedProof.selectionEnvelopes).toHaveLength(MAX_SCRIBE_TOKENS);
  });

  it('carries motor context across repeated letters without losing ownership', () => {
    const run = render('ll');
    const firstId = 'test:0';
    const secondId = 'test:1';
    const first = run.strokes.flatMap((stroke) => stroke.points)
      .filter((point) => point.owners.length === 1 && point.owners[0] === firstId);
    const second = run.strokes.flatMap((stroke) => stroke.points)
      .filter((point) => point.owners.length === 1 && point.owners[0] === secondId);
    expect(first.length).toBeGreaterThan(20);
    expect(second.length).toBeGreaterThan(20);
    const normalizedFirstWidth = Math.max(...first.map((point) => point.x))
      - Math.min(...first.map((point) => point.x));
    const normalizedSecondWidth = Math.max(...second.map((point) => point.x))
      - Math.min(...second.map((point) => point.x));
    expect(normalizedSecondWidth).not.toBeCloseTo(normalizedFirstWidth, 3);
    expect(run.strokes[0]!.points.some((point) => point.owners.length === 2)).toBe(true);

    const contextInput = (second: 'l' | 'e', separated = false) => renderScribe({
      tokens: separated
        ? [
          { id: 'a', grapheme: 'l', sourceStart: 0, sourceEnd: 1 },
          { id: 'gap', grapheme: ' ', sourceStart: 1, sourceEnd: 2 },
          { id: 'b', grapheme: second, sourceStart: 2, sourceEnd: 3 },
        ]
        : [
          { id: 'a', grapheme: 'l', sourceStart: 0, sourceEnd: 1 },
          { id: 'b', grapheme: second, sourceStart: 1, sourceEnd: 2 },
        ],
      seed: SEED,
      pxPerEm: 96,
      maxWidth: 4096,
      quality: 'full',
    });
    const firstExit = (value: ReturnType<typeof contextInput>) => value.strokes
      .flatMap((stroke) => stroke.points)
      .filter((point) => point.owners.length === 1 && point.owners[0] === 'a')
      .at(-1)!.y;
    expect(firstExit(contextInput('l'))).not.toBeCloseTo(firstExit(contextInput('e')), 5);

    const joinedSecond = contextInput('l').strokes.flatMap((stroke) => stroke.points)
      .filter((point) => point.owners.length === 1 && point.owners[0] === 'b');
    const resetSecond = contextInput('l', true).strokes.flatMap((stroke) => stroke.points)
      .filter((point) => point.owners.length === 1 && point.owners[0] === 'b');
    expect(joinedSecond[10]!.y).not.toBeCloseTo(resetSecond[10]!.y, 5);
  });

  it('builds pressure meshes with valid indices, triangle ownership, and bounds', () => {
    const run = render('test');
    for (const stroke of run.strokes) {
      expect(stroke.mesh.positions).toBeInstanceOf(Float32Array);
      expect(stroke.mesh.indices).toBeInstanceOf(Uint32Array);
      expect(stroke.mesh.positions.length).toBe(stroke.points.length * 4);
      expect(stroke.mesh.triangleOwners).toHaveLength(stroke.mesh.indices.length / 3);
      expect(Math.max(...stroke.mesh.indices)).toBeLessThan(stroke.mesh.positions.length / 2);
      expect(stroke.mesh.outline[0]).toEqual(stroke.mesh.outline.at(-1));
      expect(stroke.bounds.width).toBeGreaterThan(0);
      expect(stroke.points.every((point) => point.pressure > 0 && point.radius > 0)).toBe(true);
    }
  });

  it('fits semantic advances to maxWidth while retaining selectable spaces', () => {
    const run = render(' hello ', { pxPerEm: 120, maxWidth: 180 });
    expect(run.carets[0]!.x).toBe(0);
    expect(run.carets.at(-1)!.x).toBeCloseTo(180, 8);
    expect(run.selectionEnvelopes[0]!.kind).toBe('advance');
    expect(run.selectionEnvelopes.at(-1)!.kind).toBe('advance');
    expect(run.selectionEnvelopes[0]!.bounds.width).toBeGreaterThan(0);
    expect(run.selectionEnvelopes.every((envelope) => (
      envelope.polygon[0]!.x === envelope.polygon.at(-1)!.x
      && envelope.polygon[0]!.y === envelope.polygon.at(-1)!.y
    ))).toBe(true);
    expect(run.bounds.height).toBeGreaterThan(0);
  });
});
