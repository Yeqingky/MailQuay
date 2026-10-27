import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MailSplit } from '@/components/layout/MailSplit';
import { MessageList } from './MessageList';
import { MessageReader } from '@/features/message-view/MessageReader';
import { useComposeLauncher } from '@/features/compose/useComposeLauncher';
import { ArchiveReader } from '@/features/archive/ArchivePage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUiStore } from '@/stores/ui';
import { subscribeMailEvent, type MessageEventPayload } from '@/lib/events/bus';
import {
  fetchMessage,
  fetchMessages,
  messageKeys,
  type ListMessagesParams,
  type MessageSummary,
} from './api';
import {
  compareMessageOrder,
  insertMessageIntoCache,
  insertMessageSorted,
} from './messageCache';
import { useMailListPreferences } from './useMailListPreferences';

export interface WorkspaceQuery {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

/** Which messages belong in the mounted list, used for live inserts. */
export interface MessageListScope {
  params: ListMessagesParams;
  matches: (message: MessageSummary) => boolean;
}

interface Selection {
  id: string;
  isArchive: boolean;
}

const NEW_MESSAGE_BATCH_MS = 250;

function mergePending(
  previous: MessageSummary[],
  incoming: MessageSummary[],
): MessageSummary[] {
  const next = [...previous];
  for (const message of incoming) {
    if (!next.some((entry) => entry.id === message.id)) next.push(message);
  }
  return next.sort(compareMessageOrder);
}

export function MessagesWorkspace({
  title,
  messages,
  query,
  showAccountBadge,
  emptyTitle,
  emptyBody,
  readOnly = false,
  errorTitle,
  scope,
  resetKey,
}: {
  title: string;
  messages: MessageSummary[];
  query: WorkspaceQuery;
  showAccountBadge: boolean;
  emptyTitle: string;
  emptyBody: string;
  readOnly?: boolean;
  errorTitle?: string;
  scope?: MessageListScope;
  resetKey?: string;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<MessageSummary | null>(null);
  const [pending, setPending] = useState<MessageSummary[]>([]);
  const setMobilePane = useUiStore((state) => state.setMobilePane);
  const { launch } = useComposeLauncher();
  const { removeReadImmediately, prependNewMessages } = useMailListPreferences();
  const queryClient = useQueryClient();
  useDocumentTitle(title);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const unreadOnly = scope?.params.view === 'unread';

  // Switching folder, account, or filter must not carry the old selection or
  // its queued new messages into the next view.
  useEffect(() => {
    setSelection(null);
    setSelectedSummary(null);
    setPending([]);
  }, [resetKey]);

  // The reader keeps its own selection. A message leaving the filtered list
  // must not close the pane; only deletion or leaving the view does.
  const displayMessages = useMemo(() => {
    let list = messages;
    if (unreadOnly) {
      list = messages.filter(
        (message) =>
          message.unread || (selection?.id === message.id && !removeReadImmediately),
      );
    }
    if (
      unreadOnly &&
      !removeReadImmediately &&
      selection &&
      selectedSummary &&
      selectedSummary.id === selection.id &&
      !selection.isArchive &&
      !list.some((message) => message.id === selection.id)
    ) {
      list = insertMessageSorted(list, selectedSummary);
    }
    return list;
  }, [messages, removeReadImmediately, selection, selectedSummary, unreadOnly]);

  // Keep the retained summary in sync with flag changes made while reading.
  useEffect(() => {
    if (!selection) return;
    const current = messages.find((message) => message.id === selection.id);
    if (current && current !== selectedSummary) setSelectedSummary(current);
  }, [messages, selectedSummary, selection]);

  // A background refetch may already contain queued arrivals; do not show
  // them twice once they appear in the list.
  useEffect(() => {
    if (pending.length === 0) return;
    const present = new Set(messages.map((message) => message.id));
    if (pending.some((message) => present.has(message.id))) {
      setPending((previous) => previous.filter((message) => !present.has(message.id)));
    }
  }, [messages, pending]);

  const closeSelection = useCallback(() => {
    setSelection(null);
    setSelectedSummary(null);
    setMobilePane('list');
  }, [setMobilePane]);

  const mergeIncoming = useCallback(
    (incoming: MessageSummary[]) => {
      if (!scope || incoming.length === 0) return;
      if (prependNewMessages) {
        for (const message of incoming) {
          insertMessageIntoCache(queryClient, scope.params, message);
        }
        return;
      }
      setPending((previous) => mergePending(previous, incoming));
    },
    [prependNewMessages, queryClient, scope],
  );

  useEffect(() => {
    if (!scope) return;
    const queue = new Set<string>();
    let timer: number | undefined;
    let disposed = false;

    const isKnown = (id: string) =>
      messagesRef.current.some((message) => message.id === id) ||
      pendingRef.current.some((message) => message.id === id);

    const flush = async () => {
      timer = undefined;
      const ids = [...queue];
      queue.clear();
      if (ids.length === 0) return;
      const details = await Promise.all(
        ids.map((id) => fetchMessage(id).catch(() => null)),
      );
      if (disposed) return;
      const fresh = details.filter(
        (message): message is MessageSummary =>
          message !== null && scope.matches(message) && !isKnown(message.id),
      );
      mergeIncoming(fresh);
    };

    const schedule = (id: string) => {
      queue.add(id);
      if (timer === undefined) {
        timer = window.setTimeout(() => void flush(), NEW_MESSAGE_BATCH_MS);
      }
    };

    const unsubscribeNew = subscribeMailEvent<MessageEventPayload>('message.new', (payload) => {
      if (!payload?.messageId) return;
      if (
        scope.params.accountId &&
        payload.accountId &&
        payload.accountId !== scope.params.accountId
      ) {
        return;
      }
      schedule(payload.messageId);
    });
    const unsubscribeRemoved = subscribeMailEvent<MessageEventPayload>(
      'message.removed',
      (payload) => {
        if (!payload?.messageId) return;
        setPending((previous) => previous.filter((message) => message.id !== payload.messageId));
        setSelection((previous) => (previous?.id === payload.messageId ? null : previous));
      },
    );
    // A reconnect can miss events beyond the replay window. Compare the first
    // page again and route whatever is missing through the same preference.
    const unsubscribeReconnect = subscribeMailEvent('stream.reconnected', () => {
      void (async () => {
        const page = await fetchMessages({ ...scope.params, limit: 50 }).catch(() => null);
        if (disposed || !page) return;
        const fresh = page.messages.filter(
          (message) => scope.matches(message) && !isKnown(message.id),
        );
        mergeIncoming(fresh);
      })();
    });

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribeNew();
      unsubscribeRemoved();
      unsubscribeReconnect();
    };
  }, [mergeIncoming, scope]);

  const showPending = () => {
    if (!scope) return;
    for (const message of pending) {
      insertMessageIntoCache(queryClient, scope.params, message);
    }
    setPending([]);
    void queryClient.invalidateQueries({ queryKey: messageKeys.list(scope.params) });
  };

  const selectMessage = useCallback(
    (id: string) => {
      const summary = displayMessages.find((message) => message.id === id) ?? null;
      setSelection({ id, isArchive: summary?.isArchive === true });
      setSelectedSummary(summary);
      setMobilePane('reader');
    },
    [displayMessages, setMobilePane],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select, [contenteditable="true"]') ||
          target.closest('[role="dialog"]') !== null)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'j' || key === 'arrowdown') {
        event.preventDefault();
        const index = displayMessages.findIndex((message) => message.id === selection?.id);
        const next = displayMessages[Math.min(displayMessages.length - 1, index + 1)];
        if (next) {
          selectMessage(next.id);
        }
      } else if (key === 'k' || key === 'arrowup') {
        event.preventDefault();
        const index = displayMessages.findIndex((message) => message.id === selection?.id);
        const previous = displayMessages[Math.max(0, (index === -1 ? 0 : index) - 1)];
        if (previous) {
          selectMessage(previous.id);
        }
      } else if (event.key === 'Escape') {
        closeSelection();
      } else if (key === 'c') {
        event.preventDefault();
        void launch({ mode: 'new' });
      } else if (event.key === '/') {
        event.preventDefault();
        document.getElementById('global-search-trigger')?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSelection, displayMessages, launch, selectMessage, selection?.id]);

  return (
    <MailSplit
      hasSelection={selection !== null}
      list={
        <MessageList
          title={title}
          messages={displayMessages}
          isLoading={query.isPending}
          isError={query.isError}
          error={query.error}
          onRetry={() => query.refetch()}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          onLoadMore={() => query.fetchNextPage()}
          selectedId={selection?.id ?? null}
          onSelect={selectMessage}
          showAccountBadge={showAccountBadge}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          errorTitle={errorTitle}
          pendingCount={pending.length}
          onShowPending={showPending}
        />
      }
      reader={
        selection ? (
          selection.isArchive ? (
            <ArchiveReader
              key={selection.id}
              archiveId={selection.id}
              onBack={closeSelection}
            />
          ) : (
            <MessageReader
              key={selection.id}
              messageId={selection.id}
              readOnly={readOnly}
              onCloseMobile={closeSelection}
              onDeleted={closeSelection}
            />
          )
        ) : null
      }
    />
  );
}
