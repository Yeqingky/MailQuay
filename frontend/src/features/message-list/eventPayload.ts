import type { MessageSummary } from './api';

/**
 * Reads the lightweight summary attached to `message.new` events. Servers
 * before the summary payload only send ids, so callers fall back to a single
 * list refresh instead of requesting one detail per message.
 */
export function readEventMessage(value: unknown): MessageSummary | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MessageSummary>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.accountId !== 'string' ||
    typeof candidate.mailboxId !== 'string' ||
    typeof candidate.receivedAt !== 'string'
  ) {
    return null;
  }
  return {
    ...candidate,
    id: candidate.id,
    accountId: candidate.accountId,
    mailboxId: candidate.mailboxId,
    receivedAt: candidate.receivedAt,
    subject: typeof candidate.subject === 'string' ? candidate.subject : '',
    size: typeof candidate.size === 'number' ? candidate.size : 0,
    unread: candidate.unread === true,
    marked: candidate.marked === true,
    hasAttachments: candidate.hasAttachments === true,
    bodyState: typeof candidate.bodyState === 'string' ? candidate.bodyState : 'missing',
  } as MessageSummary;
}
