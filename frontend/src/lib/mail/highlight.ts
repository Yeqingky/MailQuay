export interface HighlightToken {
  text: string;
  highlighted: boolean;
}

/**
 * Split a search snippet on the `<mark>` markers produced by the backend so it
 * renders as highlighted text instead of showing the literal tags. Input is
 * treated as plain text: only the marker tags are interpreted.
 */
export function parseHighlightTokens(snippet: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const pattern = /<mark>(.*?)<\/mark>/gi;
  let index = 0;
  for (const match of snippet.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > index) tokens.push({ text: snippet.slice(index, start), highlighted: false });
    tokens.push({ text: match[1], highlighted: true });
    index = start + match[0].length;
  }
  if (index < snippet.length) tokens.push({ text: snippet.slice(index), highlighted: false });
  return tokens;
}
