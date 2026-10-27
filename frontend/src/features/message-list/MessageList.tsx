import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, Star } from 'lucide-react';
import { SenderAvatar } from '@/components/common/SenderAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/common/States';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatListDate } from '@/lib/format';
import { parseHighlightTokens } from '@/lib/mail/highlight';
import { cn } from '@/lib/utils';
import type { MessageSummary } from './api';

const ROW_HEIGHT = 88;
const OVERSCAN = 5;

export function MessageList({
  title,
  messages,
  isLoading,
  isError,
  error,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  selectedId,
  onSelect,
  showAccountBadge,
  emptyTitle,
  emptyBody,
  errorTitle,
  pendingCount = 0,
  onShowPending,
}: {
  title: string;
  messages: MessageSummary[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showAccountBadge: boolean;
  emptyTitle: string;
  emptyBody: string;
  errorTitle?: string;
  pendingCount?: number;
  onShowPending?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const previousMessages = useRef(messages);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    setViewportHeight(node.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [title]);

  // Live inserts prepend rows. Keep the message at the top of the viewport at
  // the same visual position instead of jumping to the newest mail.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    const previous = previousMessages.current;
    previousMessages.current = messages;
    if (!node || previous === messages || previous.length === 0 || messages.length === 0) return;
    if (node.scrollTop <= 0) return;
    const previousIndex = Math.min(
      previous.length - 1,
      Math.floor(node.scrollTop / ROW_HEIGHT),
    );
    const anchor = previous[previousIndex];
    if (!anchor) return;
    const nextIndex = messages.findIndex((message) => message.id === anchor.id);
    if (nextIndex < 0 || nextIndex === previousIndex) return;
    const adjusted = Math.max(0, node.scrollTop + (nextIndex - previousIndex) * ROW_HEIGHT);
    node.scrollTop = adjusted;
    setScrollTop(adjusted);
  }, [messages]);

  const total = messages.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    total,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = useMemo(() => messages.slice(start, end), [end, messages, start]);
  const totalHeight = total * ROW_HEIGHT;

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      node.scrollTop + node.clientHeight >= node.scrollHeight - 480
    ) {
      onLoadMore();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {pendingCount > 0 ? (
        <div className="shrink-0 border-b px-2 py-1.5">
          <button
            type="button"
            onClick={onShowPending}
            className="w-full rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('mail.newMessages', { count: pendingCount })}
          </button>
        </div>
      ) : null}
      {isLoading ? (
        <div
          role="status"
          className="flex min-h-0 flex-1 items-center justify-center"
        >
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={onRetry} title={errorTitle ?? t('mail.errorTitle')} />
      ) : messages.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyBody} />
      ) : (
        <ScrollArea
          ref={scrollRef}
          onScroll={handleScroll}
          containerClassName="min-h-0 flex-1"
         
          aria-label={t('mail.messageList')}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visible.map((message, index) => {
              const absoluteIndex = start + index;
              const sender = message.from?.name || message.from?.email || '';
              const isSelected = selectedId === message.id;
              return (
                <div
                  key={message.id}
                  style={{
                    position: 'absolute',
                    top: absoluteIndex * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                  className={cn(
                    'flex items-start gap-2 border-b px-2 py-2 transition-colors md:px-3',
                    isSelected ? 'bg-accent' : 'hover:bg-accent/60',
                    message.unread && !isSelected && 'bg-muted/20',
                  )}
                >
                  <div className="flex h-[72px] min-w-0 flex-1 items-center">
                    <button
                      type="button"
                      onClick={() => onSelect(message.id)}
                      aria-label={t('mail.openMessage', { sender })}
                      aria-current={isSelected ? 'true' : undefined}
                      className="flex h-full w-full min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="relative shrink-0">
                        <SenderAvatar
                          className="size-8"
                          name={sender}
                          email={message.from?.email}
                        />
                        {message.unread ? (
                          <span
                            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm',
                              message.unread && 'font-semibold',
                            )}
                          >
                            {sender || t('common.unknown')}
                          </span>
                          <time
                            className="shrink-0 text-[11px] text-muted-foreground"
                            dateTime={message.receivedAt ?? message.sentAt}
                          >
                            {formatListDate(
                              message.receivedAt ?? message.sentAt,
                              i18n.language,
                              undefined,
                            )}
                          </time>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-[13px]',
                              message.unread ? 'font-medium' : 'text-foreground/90',
                            )}
                          >
                            {message.subject || t('drafting.noSubject')}
                          </span>
                          {message.hasAttachments ? (
                            <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={t('mail.hasAttachments')} />
                          ) : null}
                          {message.marked ? (
                            <Star className="size-3 shrink-0 fill-current text-foreground" aria-label={t('mail.markedIndicator')} />
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {message.snippet
                              ? parseHighlightTokens(message.snippet).map((token, index) =>
                                  token.highlighted ? (
                                    <mark
                                      key={index}
                                      className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-500/30"
                                    >
                                      {token.text}
                                    </mark>
                                  ) : (
                                    <span key={index}>{token.text}</span>
                                  ),
                                )
                              : ''}
                          </span>
                        </div>
                        {showAccountBadge ? (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="truncate">
                              {message.accountName || message.accountEmail}
                            </span>
                            {message.preserved ? (
                              <Badge variant="outline" className="ml-1 px-1 py-0 text-[9px]">
                                {t('mail.preservedIndicator')}
                              </Badge>
                            ) : null}
                            {message.isArchive ? (
                              <Badge variant="outline" className="ml-1 px-1 py-0 text-[9px]">
                                {t('mail.archivedIndicator')}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {hasNextPage ? (
            <div className="flex items-center justify-center border-t p-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? t('mail.loadingMore') : t('mail.loadMore')}
              </Button>
            </div>
          ) : null}
        </ScrollArea>
      )}
    </div>
  );
}
