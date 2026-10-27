import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SearchFilters, AttachmentFilter } from '@/stores/search';
import { searchKeys, searchMessages, type SearchParams } from './api';
import type { MessagePage } from '@/features/message-list/api';

export function hasSearchCriteria(filters: SearchFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.accountId !== '' ||
    filters.mailboxId !== '' ||
    filters.recipient.trim() !== '' ||
    filters.sender.trim() !== '' ||
    filters.hasAttachment !== 'any'
  );
}

function attachmentValue(filter: AttachmentFilter): boolean | undefined {
  if (filter === 'with') return true;
  if (filter === 'without') return false;
  return undefined;
}

export function toSearchParams(filters: SearchFilters): SearchParams {
  return {
    q: filters.q.trim() || undefined,
    mode: filters.mode,
    accountId: filters.accountId || undefined,
    mailboxId: filters.mailboxId || undefined,
    recipient: filters.recipient.trim() || undefined,
    sender: filters.sender.trim() || undefined,
    hasAttachment: attachmentValue(filters.hasAttachment),
    limit: 50,
  };
}

export function useSearchMessages(filters: SearchFilters) {
  const params = toSearchParams(filters);
  const enabled = hasSearchCriteria(filters);
  const query = useInfiniteQuery<
    MessagePage,
    Error,
    InfiniteData<MessagePage>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: searchKeys.results(params),
    queryFn: ({ pageParam }) => searchMessages({ ...params, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled,
  });

  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.messages) ?? [],
    [query.data],
  );

  return { ...query, messages, enabled };
}
