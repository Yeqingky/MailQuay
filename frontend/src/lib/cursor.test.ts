import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, isCompositeCursorState } from './cursor';

describe('cursor helpers', () => {
  it('round-trips composite pagination state', () => {
    const state = {
      cursors: { 'mailbox-1': 'abc', 'mailbox-2': undefined },
      exhausted: ['mailbox-3'],
    };
    const encoded = encodeCursor(state);
    expect(encoded).not.toContain('=');
    expect(decodeCursor(encoded, isCompositeCursorState)).toEqual(state);
  });

  it('preserves unicode cursor values', () => {
    const state = { cursors: { mailbox: 'üñïçødé/值' }, exhausted: [] };
    const decoded = decodeCursor(encodeCursor(state), isCompositeCursorState);
    expect(decoded?.cursors.mailbox).toBe('üñïçødé/值');
  });

  it('returns null for malformed or foreign cursors', () => {
    expect(decodeCursor('not-base64!!', isCompositeCursorState)).toBeNull();
    expect(decodeCursor(undefined, isCompositeCursorState)).toBeNull();
    expect(decodeCursor(encodeCursor({ hello: 'world' }), isCompositeCursorState)).toBeNull();
    expect(
      decodeCursor(encodeCursor({ cursors: { a: 1 }, exhausted: [] }), isCompositeCursorState),
    ).toBeNull();
  });

  it('rejects other cursor versions', () => {
    const legacy = btoa(JSON.stringify({ v: 2, state: { cursors: {}, exhausted: [] } }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeCursor(legacy, isCompositeCursorState)).toBeNull();
  });
});
