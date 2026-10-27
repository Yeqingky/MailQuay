import type { DraftInput } from './draft-api';

export type ComposeChannelMessage =
  | { type: 'query'; draftId: string }
  | { type: 'open'; draftId: string }
  | { type: 'draft-saved'; draftId: string; revision: number; fields: DraftInput }
  | { type: 'draft-sent'; draftId: string };

function isDraftInput(value: unknown): value is DraftInput {
  if (typeof value !== 'object' || value === null) return false;
  if (!('accountId' in value) || typeof value.accountId !== 'string') return false;
  if (!('subject' in value) || typeof value.subject !== 'string') return false;
  if (!('bodyText' in value) || typeof value.bodyText !== 'string') return false;
  if (!('bodyHtml' in value) || typeof value.bodyHtml !== 'string') return false;
  return true;
}

export function parseComposeChannelMessage(value: unknown): ComposeChannelMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('type' in value) || typeof value.type !== 'string') return null;
  if (!('draftId' in value) || typeof value.draftId !== 'string') return null;
  const draftId = value.draftId;
  if (value.type === 'query' || value.type === 'open' || value.type === 'draft-sent') {
    return { type: value.type, draftId };
  }
  if (value.type === 'draft-saved') {
    if (!('revision' in value) || typeof value.revision !== 'number') return null;
    if (!('fields' in value) || !isDraftInput(value.fields)) return null;
    return {
      type: 'draft-saved',
      draftId,
      revision: value.revision,
      fields: value.fields,
    };
  }
  return null;
}
