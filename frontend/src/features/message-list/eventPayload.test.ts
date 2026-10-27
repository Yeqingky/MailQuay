import { describe, expect, it } from 'vitest';
import { readEventMessage } from './eventPayload';

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    accountId: 'acc-1',
    mailboxId: 'mb-1',
    subject: 'Hello',
    receivedAt: '2026-10-20T10:00:00Z',
    size: 120,
    unread: true,
    marked: false,
    hasAttachments: false,
    bodyState: 'cached',
    ...overrides,
  };
}

describe('readEventMessage', () => {
  it('returns the summary carried by the event', () => {
    const message = readEventMessage(summary());
    expect(message?.id).toBe('m-1');
    expect(message?.subject).toBe('Hello');
    expect(message?.unread).toBe(true);
  });

  it('fills defaults for optional fields', () => {
    const message = readEventMessage({
      id: 'm-1',
      accountId: 'acc-1',
      mailboxId: 'mb-1',
      receivedAt: '2026-10-20T10:00:00Z',
    });
    expect(message).toMatchObject({ subject: '', size: 0, unread: false, marked: false });
  });

  it('rejects payloads without the required ids', () => {
    expect(readEventMessage(null)).toBeNull();
    expect(readEventMessage('m-1')).toBeNull();
    expect(readEventMessage({ id: 'm-1', accountId: 'acc-1' })).toBeNull();
  });
});
