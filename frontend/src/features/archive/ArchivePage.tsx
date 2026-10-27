import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArrowLeft,
  Download,
  ImageOff,
  Paperclip,
  RefreshCw,
} from 'lucide-react';
import { SenderAvatar } from '@/components/common/SenderAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { MailSplit } from '@/components/layout/MailSplit';
import { MailFrame, useMailFrame } from '@/features/message-view/SafeMailFrame';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatAddress } from '@/lib/mail/address';
import { formatBytes, formatDate, formatListDate } from '@/lib/format';
import { allowSenderImages, isSenderImagesAllowed } from '@/lib/mail/remoteImages';
import { toast } from '@/components/ui/toast';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';
import {
  archiveAttachmentUrl,
  archiveKeys,
  archiveRawUrl,
  fetchArchive,
  fetchArchiveBody,
  fetchArchives,
  type ArchiveEntry,
} from './api';

export function ArchivePage() {
  const { t, i18n } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const setMobilePane = useUiStore((state) => state.setMobilePane);
  useDocumentTitle(t('archive.title'));

  const query = useInfiniteQuery({
    queryKey: archiveKeys.list(),
    queryFn: ({ pageParam }) => fetchArchives(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
  const archives = useMemo(
    () => query.data?.pages.flatMap((page) => page.archives) ?? [],
    [query.data],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
        setMobilePane('list');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setMobilePane]);

  return (
    <MailSplit
      hasSelection={selectedId !== null}
      list={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-12 shrink-0 items-center gap-2 border-b px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t('archive.title')}</p>
              <p className="text-[11px] text-muted-foreground">
                {t('mail.messageCount', { count: archives.length })}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('topbar.refresh')}
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('topbar.refresh')}</TooltipContent>
            </Tooltip>
          </div>

          {query.isPending ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : archives.length === 0 ? (
            <EmptyState
              icon={<Archive className="size-5" aria-hidden="true" />}
              title={t('archive.emptyTitle')}
              description={t('archive.emptyBody')}
            />
          ) : (
            <ScrollArea containerClassName="min-h-0 flex-1">
              {archives.map((entry) => {
                const isSelected = entry.id === selectedId;
                const sender = formatAddress(entry.from);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(entry.id);
                      setMobilePane('reader');
                    }}
                    aria-current={isSelected ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                      isSelected && 'bg-accent',
                    )}
                  >
                    <SenderAvatar
                      className="size-8 shrink-0"
                      name={entry.from?.name || sender}
                      email={entry.from?.email}
                      fallback={entry.subject}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {sender || t('common.unknown')}
                        </span>
                        <time className="shrink-0 text-[11px] text-muted-foreground">
                          {formatListDate(entry.archivedAt, i18n.language, undefined)}
                        </time>
                      </div>
                      <p className="mt-0.5 truncate text-[13px]">
                        {entry.subject || t('drafting.noSubject')}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="px-1 py-0 text-[9px]">
                          {t('mail.archivedIndicator')}
                        </Badge>
                        <span className="truncate">{entry.originAccountEmail}</span>
                        {entry.hasAttachments ? (
                          <Paperclip className="size-3 shrink-0" aria-label={t('mail.hasAttachments')} />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
              {query.hasNextPage ? (
                <div className="p-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? t('mail.loadingMore') : t('mail.loadMore')}
                  </Button>
                </div>
              ) : null}
            </ScrollArea>
          )}
        </div>
      }
      reader={selectedId ? <ArchiveReader archiveId={selectedId} onBack={() => {
        setSelectedId(null);
        setMobilePane('list');
      }} /> : null}
    />
  );
}

export function ArchiveReader({ archiveId, onBack }: { archiveId: string; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const [allowed, setAllowed] = useState(false);
  const detail = useQuery({
    queryKey: archiveKeys.detail(archiveId),
    queryFn: () => fetchArchive(archiveId),
  });
  const body = useQuery({
    queryKey: archiveKeys.body(archiveId),
    queryFn: () => fetchArchiveBody(archiveId),
  });
  const entry: ArchiveEntry | undefined = detail.data;
  const sender = entry?.from?.email;
  const allowRemoteImages = allowed || isSenderImagesAllowed(sender);

  const frame = useMailFrame({
    html: body.data?.html,
    text: body.data?.text,
    allowRemoteImages,
  });

  if (detail.isPending && !entry) return <LoadingState label={t('reader.loadingArchive')} />;
  if (!entry) {
    return (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2 md:h-14 md:px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={t('mail.mobileBackToList')}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <Badge variant="outline">{t('mail.archivedIndicator')}</Badge>
        <span className="text-xs text-muted-foreground">{t('reader.archivedReadOnly')}</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" asChild>
          <a href={archiveRawUrl(entry.id)}>
            <Download className="size-4" aria-hidden="true" />
            {t('archive.downloadRaw')}
          </a>
        </Button>
      </div>

      <ScrollArea containerClassName="flex max-h-[46%] shrink-0 flex-col" className="border-b px-4 py-4 md:px-6">
        <div className="flex items-start gap-3">
          <SenderAvatar
            className="mt-0.5 size-9"
            name={entry.from?.name}
            email={entry.from?.email}
            fallback={entry.subject}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-snug md:text-lg">
              {entry.subject || t('drafting.noSubject')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatAddress(entry.from)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('archive.archivedAt', {
                date: formatDate(entry.archivedAt, i18n.language, undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('archive.origin', { email: entry.originAccountEmail })}
              {entry.originMailboxPath ? ` · ${entry.originMailboxPath}` : ''}
            </p>
          </div>
        </div>

        {entry.attachments && entry.attachments.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t('reader.attachmentsTitle')}
            </p>
            <ul className="flex flex-wrap gap-2">
              {entry.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    href={archiveAttachmentUrl(entry.id, attachment.id)}
                    className="flex max-w-72 items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs hover:bg-accent"
                    aria-label={t('reader.downloadAttachment', { name: attachment.filename })}
                  >
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 truncate">{attachment.filename}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatBytes(attachment.size, i18n.language)}
                    </span>
                    <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ScrollArea>

      {frame.blockedRemoteImages > 0 && !allowRemoteImages ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs md:px-6">
          <ImageOff className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">
            {t('reader.remoteImagesBlockedCount', { count: frame.blockedRemoteImages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              allowSenderImages(sender);
              setAllowed(true);
              toast(t('reader.imagesAllowed'));
            }}
          >
            {t('reader.loadRemoteImages')}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-3 pt-2 md:p-4 md:pt-2">
        {body.isPending && !body.data ? (
          <LoadingState label={t('reader.bodyLoading')} />
        ) : !body.data ? (
          <ErrorState
            title={t('reader.bodyErrorTitle')}
            error={body.error}
            onRetry={() => void body.refetch()}
          />
        ) : !body.data.html && !body.data.text ? (
          <EmptyState title={t('reader.noArchiveBody')} />
        ) : (
          <MailFrame
            documentHtml={frame.documentHtml}
            title={t('mail.readerPane')}
            className="h-full w-full rounded-xl border bg-card"
          />
        )}
      </div>
    </div>
  );
}
