import { describe, expect, it } from 'vitest';
import {
  reconcileScribeTokens,
  ScribeTokenReconciler,
  tokenizeScribeText,
} from './tokens';

describe('Scribe token identity', () => {
  it('tokenizes graphemes with UTF-16 source spans', () => {
    const tokens = tokenizeScribeText('é🙂l', 'proof');
    expect(tokens.map(({ grapheme, sourceStart, sourceEnd }) => ({
      grapheme,
      sourceStart,
      sourceEnd,
    }))).toEqual([
      { grapheme: 'é', sourceStart: 0, sourceEnd: 2 },
      { grapheme: '🙂', sourceStart: 2, sourceEnd: 4 },
      { grapheme: 'l', sourceStart: 4, sourceEnd: 5 },
    ]);
    expect(tokens.map((token) => token.id)).toEqual(['proof:0', 'proof:1', 'proof:2']);
  });

  it('keeps surviving token ids when text is inserted around them', () => {
    const before = tokenizeScribeText('hello', 'edit');
    const result = reconcileScribeTokens('thello.', before, { namespace: 'edit', nextId: 5 });
    expect(result.tokens.slice(1, -1).map((token) => token.id)).toEqual(
      before.map((token) => token.id),
    );
    expect(result.tokens[0]!.id).toBe('edit:5');
    expect(result.tokens.at(-1)!.id).toBe('edit:6');
    expect(result.tokens.map((token) => [token.sourceStart, token.sourceEnd])).toEqual([
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
    ]);
  });

  it('reconciles repeated graphemes one-to-one without duplicate identities', () => {
    const previous = tokenizeScribeText('llelle', 'repeat');
    const result = reconcileScribeTokens('lllelle', previous, {
      namespace: 'repeat',
      nextId: previous.length,
    });
    expect(new Set(result.tokens.map((token) => token.id)).size).toBe(result.tokens.length);
    expect(result.tokens.filter((token) => previous.some((old) => old.id === token.id))).toHaveLength(6);
  });

  it('never reuses ids and protects reconciler state from returned-array mutation', () => {
    const reconciler = new ScribeTokenReconciler({ namespace: 'live' });
    const first = reconciler.update('el');
    const removedId = first[0]!.id;
    reconciler.update('l');
    const third = reconciler.update('el');
    expect(third[0]!.id).not.toBe(removedId);
    third.splice(0, third.length);
    expect(reconciler.tokens).toHaveLength(2);
    const snapshot = reconciler.tokens;
    (snapshot[0] as { id: string }).id = 'hostile';
    expect(reconciler.tokens[0]!.id).not.toBe('hostile');
  });

  it('rejects empty namespaces, invalid counters, and duplicate initial ids', () => {
    expect(() => tokenizeScribeText('e', '')).toThrow(/namespace/);
    expect(() => new ScribeTokenReconciler({ namespace: 'x', nextId: -1 })).toThrow(/nextId/);
    expect(() => new ScribeTokenReconciler({
      initialTokens: [
        { id: 'same', grapheme: 'e', sourceStart: 0, sourceEnd: 1 },
        { id: 'same', grapheme: 'l', sourceStart: 1, sourceEnd: 2 },
      ],
    })).toThrow(/unique/);
  });
});
