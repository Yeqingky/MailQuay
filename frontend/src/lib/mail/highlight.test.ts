import { describe, expect, it } from 'vitest';
import { parseHighlightTokens } from './highlight';

describe('parseHighlightTokens', () => {
  it('returns plain text as a single token', () => {
    expect(parseHighlightTokens('plain body')).toEqual([{ text: 'plain body', highlighted: false }]);
  });

  it('splits highlighted terms into their own tokens', () => {
    expect(parseHighlightTokens('the <mark>invoice</mark> for <mark>March</mark> is late')).toEqual([
      { text: 'the ', highlighted: false },
      { text: 'invoice', highlighted: true },
      { text: ' for ', highlighted: false },
      { text: 'March', highlighted: true },
      { text: ' is late', highlighted: false },
    ]);
  });

  it('treats a leading marker and empty text correctly', () => {
    expect(parseHighlightTokens('<mark>term</mark> rest')).toEqual([
      { text: 'term', highlighted: true },
      { text: ' rest', highlighted: false },
    ]);
  });

  it('leaves unmatched markers as text', () => {
    expect(parseHighlightTokens('literal <mark> tag')).toEqual([
      { text: 'literal <mark> tag', highlighted: false },
    ]);
  });

  it('handles an empty snippet', () => {
    expect(parseHighlightTokens('')).toEqual([]);
  });
});
