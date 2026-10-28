import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SearchFilters, AttachmentFilter } from '@/stores/search';
import { searchKeys, searchMessages, type SearchParams } from './api';
import type { MessagePage } from '@/features/message-list/api';

/** Account and folder the current page represents, empty for global views. */
export interface SearchScope {
  accountId?: string;
  mailboxId?: string;
}

export function hasSearchCriteria(filters: SearchFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.accountId !== '' ||
    filters.recipient.trim() !== '' ||
    filters.sender.trim() !== '' ||
    filters.hasAttachment !== 'any'
  );
}

/** A folder-scoped search does not treat the hidden account filter as criteria. */
export function hasScopedCriteria(filters: SearchFilters, scope: SearchScope): boolean {
  if (!scope.accountId) return hasSearchCriteria(filters);
  return hasSearchCriteria({ ...filters, accountId: '' });
}

function attachmentValue(filter: AttachmentFilter): boolean | undefined {
  if (filter === 'with') return true;
  if (filter === 'without') return false;
  return undefined;
}

export function toSearchParams(filters: SearchFilters, scope: SearchScope = {}): SearchParams {
  return {
    q: filters.q.trim() || undefined,
    mode: filters.mode,
    accountId: scope.accountId || filters.accountId || undefined,
    mailboxId: scope.mailboxId,
    recipient: filters.recipient.trim() || undefined,
    sender: filters.sender.trim() || undefined,
    hasAttachment: attachmentValue(filters.hasAttachment),
    limit: 50,
  };
}

export function useSearchMessages(filters: SearchFilters, scope: SearchScope = {}) {
  const params = toSearchParams(filters, scope);
  const enabled = hasScopedCriteria(filters, scope);
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
