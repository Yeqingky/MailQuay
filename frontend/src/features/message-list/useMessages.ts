import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  fetchMessage,
  fetchMessageBody,
  fetchMessages,
  messageKeys,
  type ListMessagesParams,
  type MessagePage,
} from './api';

export function useMessageList(params: ListMessagesParams, enabled = true) {
  const query = useInfiniteQuery<
    MessagePage,
    Error,
    InfiniteData<MessagePage>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: messageKeys.list(params),
    queryFn: ({ pageParam }) => fetchMessages({ ...params, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled,
  });

  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.messages) ?? [],
    [query.data],
  );

  return { ...query, messages };
}

export function useMessageDetail(id: string | null) {
  return useQuery({
    queryKey: messageKeys.detail(id ?? ''),
    queryFn: () => {
      if (!id) throw new Error('No message selected');
      return fetchMessage(id);
    },
    enabled: Boolean(id),
  });
}

export function useMessageBody(id: string | null, enabled = true) {
  return useQuery({
    queryKey: messageKeys.body(id ?? ''),
    queryFn: () => {
      if (!id) throw new Error('No message selected');
      return fetchMessageBody(id);
    },
    enabled: Boolean(id) && enabled,
    retry: 1,
  });
}
