import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { messageKeys, type ListMessagesParams, type MessagePage, type MessageSummary } from './api';

export type MessageListCache = InfiniteData<MessagePage>;
export type MessageUpdater = (message: MessageSummary) => MessageSummary | null;

const MESSAGE_LIST_PREDICATE = (query: { queryKey: QueryKey }) =>
  Array.isArray(query.queryKey) &&
  query.queryKey[0] === 'messages' &&
  (query.queryKey[1] === 'list' || query.queryKey[1] === 'multi');

export function patchMessageCaches(queryClient: QueryClient, updater: MessageUpdater): void {
  queryClient.setQueriesData<MessageListCache>(
    { predicate: MESSAGE_LIST_PREDICATE },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          messages: page.messages
            .map((message) => updater(message))
            .filter((message): message is MessageSummary => message !== null),
        })),
      };
    },
  );
}

/** Newest first, then the same id tiebreak the server sorts by. */
export function compareMessageOrder(a: MessageSummary, b: MessageSummary): number {
  const at = a.receivedAt ? Date.parse(a.receivedAt) : 0;
  const bt = b.receivedAt ? Date.parse(b.receivedAt) : 0;
  if (at !== bt) return bt - at;
  return b.id.localeCompare(a.id);
}

export function insertMessageSorted(
  messages: MessageSummary[],
  message: MessageSummary,
): MessageSummary[] {
  if (messages.some((entry) => entry.id === message.id)) return messages;
  const next = [...messages];
  const index = next.findIndex((entry) => compareMessageOrder(message, entry) < 0);
  next.splice(index === -1 ? next.length : index, 0, message);
  return next;
}

/**
 * Inserts one message into the cached page list without refetching. Returns
 * false when the list has not been loaded yet, so callers can refetch.
 */
export function insertMessageIntoCache(
  queryClient: QueryClient,
  params: ListMessagesParams,
  message: MessageSummary,
): boolean {
  let inserted = false;
  queryClient.setQueryData<MessageListCache>(messageKeys.list(params), (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((page) => page.messages.some((entry) => entry.id === message.id))) {
      inserted = true;
      return data;
    }
    const pages = data.pages.map((page) => ({ ...page }));
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const last = page.messages[page.messages.length - 1];
      if (!last || compareMessageOrder(message, last) < 0 || index === pages.length - 1) {
        pages[index] = { ...page, messages: insertMessageSorted(page.messages, message) };
        inserted = true;
        return { ...data, pages };
      }
    }
    return data;
  });
  return inserted;
}
