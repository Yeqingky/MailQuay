import { api, unwrap, type Schemas } from '@/lib/api/client';

export type SearchParams = {
  q?: string;
  mode?: 'subject' | 'all';
  accountId?: string;
  mailboxId?: string;
  recipient?: string;
  sender?: string;
  hasAttachment?: boolean;
  cursor?: string;
  limit?: number;
};

export type SearchResult = Schemas['MessagePage'];

export const searchKeys = {
  all: ['search'] as const,
  results: (params: SearchParams) => ['search', 'results', params] as const,
};

export async function searchMessages(params: SearchParams): Promise<SearchResult> {
  return unwrap(
    await api.GET('/search', {
      params: {
        query: {
          q: params.q || undefined,
          mode: params.mode ?? 'all',
          accountId: params.accountId || undefined,
          mailboxId: params.mailboxId || undefined,
          recipient: params.recipient || undefined,
          sender: params.sender || undefined,
          hasAttachment: params.hasAttachment,
          cursor: params.cursor,
          limit: params.limit ?? 50,
        },
      },
    }),
  );
}
