import { api, unwrap, type Schemas } from '@/lib/api/client';

export type MessageSummary = Schemas['MessageSummary'];
export type MessageDetail = Schemas['MessageDetail'];
export type MessageBody = Schemas['MessageBody'];
export type MessagePage = Schemas['MessagePage'];

export interface ListMessagesParams {
  view: 'mailbox' | 'all' | 'unread' | 'marked' | 'sent' | 'trash';
  accountId?: string;
  mailboxId?: string;
  cursor?: string;
  limit?: number;
}

export const messageKeys = {
  all: ['messages'] as const,
  list: (params: ListMessagesParams) => ['messages', 'list', params] as const,
  detail: (id: string) => ['messages', 'detail', id] as const,
  body: (id: string) => ['messages', 'body', id] as const,
};

export async function fetchMessages(params: ListMessagesParams): Promise<MessagePage> {
  return unwrap(
    await api.GET('/messages', {
      params: {
        query: {
          view: params.view,
          accountId: params.accountId,
          mailboxId: params.mailboxId,
          cursor: params.cursor,
          limit: params.limit ?? 50,
        },
      },
    }),
  );
}

export async function fetchMessage(id: string): Promise<MessageDetail> {
  return unwrap(await api.GET('/messages/{id}', { params: { path: { id } } }));
}

export async function fetchMessageBody(id: string): Promise<MessageBody> {
  return unwrap(await api.GET('/messages/{id}/body', { params: { path: { id } } }));
}

export async function updateMessage(
  id: string,
  body: Schemas['MessageUpdate'],
): Promise<MessageDetail> {
  return unwrap(await api.PATCH('/messages/{id}', { params: { path: { id } }, body }));
}

export async function deleteMessage(id: string): Promise<void> {
  const result = await api.DELETE('/messages/{id}', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export async function archiveMessage(id: string): Promise<Schemas['ArchiveEntry']> {
  return unwrap(await api.POST('/messages/{id}/archive', { params: { path: { id } } }));
}

export async function moveMessage(id: string, mailboxId: string): Promise<void> {
  const result = await api.POST('/messages/{id}/move', {
    params: { path: { id } },
    body: { mailboxId },
  });
  if (result.response.ok) return;
  unwrap(result);
}
