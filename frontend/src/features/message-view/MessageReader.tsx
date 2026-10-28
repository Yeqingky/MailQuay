import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ArrowLeft,
  Download,
  Paperclip,
  Reply,
  Send,
  Star,
  Trash2,
  ImageOff,
  Info,
} from 'lucide-react';
import { SenderAvatar } from '@/components/common/SenderAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorState, LoadingState } from '@/components/common/States';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatAddress, formatAddressList } from '@/lib/mail/address';
import { formatBytes, formatDate } from '@/lib/format';
import {
  archiveMessage,
  deleteMessage,
  updateMessage,
  messageKeys,
  type MessageDetail,
} from '@/features/message-list/api';
import { useMessageBody, useMessageDetail } from '@/features/message-list/useMessages';
import { patchMessageCaches } from '@/features/message-list/messageCache';
import { MailFrame, useMailFrame } from './SafeMailFrame';
import { messageAttachmentUrl, messageRawUrl } from './downloads';
import { useCidImages } from './useCidImages';
import { useComposeLauncher } from '@/features/compose/useComposeLauncher';
import { isSenderImagesAllowed, allowSenderImages } from '@/lib/mail/remoteImages';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-xs">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function MessageReader({
  messageId,
  onCloseMobile,
  onDeleted,
  readOnly = false,
}: {
  messageId: string;
  onCloseMobile: () => void;
  onDeleted: () => void;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const messageError = useErrorMessage();
  const { launch } = useComposeLauncher();
  const detail = useMessageDetail(messageId);
  const body = useMessageBody(messageId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const markedReadRef = useRef<string | null>(null);

  const message = detail.data;
  const inTrash = message?.mailboxRole === 'trash';
  const senderEmail = message?.from?.email;
  // Derive the consent during render so the first frame already reflects the
  // stored sender choice. A post-mount state flip would race the srcdoc load.
  const allowRemoteImages = allowed || isSenderImagesAllowed(senderEmail);

  const applyUpdate = (update: { unread?: boolean; marked?: boolean }) => {
    if (!message) return;
    queryClient.setQueryData<MessageDetail>(messageKeys.detail(message.id), {
      ...message,
      ...update,
    });
    patchMessageCaches(queryClient, (summary) =>
      summary.id === message.id ? { ...summary, ...update } : summary,
    );
  };

  const update = useMutation({
    mutationFn: (patch: { unread?: boolean; marked?: boolean }) =>
      updateMessage(messageId, patch),
    onMutate: (patch) => applyUpdate(patch),
    onError: (error) => {
      toast(t('common.updateFailed'), {
        description: messageError(error),
        variant: 'destructive',
      });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onSuccess: (updated) => {
      // Flag updates do not change attachments. Keep a cached non-empty list
      // when the response omits it or returns an empty list.
      queryClient.setQueryData<MessageDetail>(messageKeys.detail(updated.id), (previous) => {
        if (!previous) return updated;
        return {
          ...previous,
          ...updated,
          attachments: updated.attachments?.length
            ? updated.attachments
            : (previous.attachments ?? updated.attachments),
        };
      });
    },
  });

  useEffect(() => {
    if (readOnly) return;
    if (!message || !message.unread || markedReadRef.current === message.id) return;
    markedReadRef.current = message.id;
    update.mutate({ unread: false });
    // The mutation object is stable enough here; this runs once per selected message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, message?.unread, readOnly]);

  const archive = useMutation({
    mutationFn: () => archiveMessage(messageId),
    onSuccess: () => {
      toast(t('reader.archiveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
    },
    onError: (error) =>
      toast(t('common.updateFailed'), { description: messageError(error), variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: () => deleteMessage(messageId),
    onSuccess: () => {
      toast(t('mail.deleteSuccess'));
      patchMessageCaches(queryClient, (summary) =>
        summary.id === messageId ? null : summary,
      );
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      setDeleteOpen(false);
      onDeleted();
    },
    onError: (error) =>
      toast(t('common.deleteFailed'), { description: messageError(error), variant: 'destructive' }),
  });

  const imageAttachments =
    message?.attachments?.length ? message.attachments : body.data?.attachments;
  const cidImages = useCidImages(detail.data?.id, imageAttachments);
  const frame = useMailFrame({
    html: body.data?.html,
    text: body.data?.text,
    allowRemoteImages,
    cidImages,
  });

  if (detail.isPending && !message) {
    return <LoadingState label={t('reader.loading')} />;
  }

  if (!message) {
    return (
      <ErrorState
        title={t('reader.errorTitle')}
        error={detail.error}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const attachments = (message.attachments ?? body.data?.attachments ?? []).filter(
    (attachment) => !(attachment.contentId && attachment.contentType.startsWith('image/')),
  );
  const reply = (mode: 'reply' | 'forward') => {
    void launch({
      mode,
      message,
      messageBodyHtml: body.data?.html,
      messageBodyText: body.data?.text,
      accountId: message.accountId,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0.4, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2 md:h-14 md:px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={t('mail.mobileBackToList')}
          onClick={onCloseMobile}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('reader.reply')}
              onClick={() => reply('reply')}
            >
              <Reply className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('reader.reply')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('reader.forward')}
              onClick={() => reply('forward')}
            >
              <ForwardIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('reader.forward')}</TooltipContent>
        </Tooltip>
        {readOnly ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={message.marked ? t('reader.unmark') : t('reader.mark')}
                aria-pressed={message.marked}
                onClick={() => update.mutate({ marked: !message.marked })}
              >
                <Star
                  className={message.marked ? 'size-4 fill-current' : 'size-4'}
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {message.marked ? t('reader.unmark') : t('reader.mark')}
            </TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <a href={messageRawUrl(message.id)} aria-label={t('reader.downloadOriginal')}>
                <Download className="size-4" aria-hidden="true" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('reader.downloadOriginal')}</TooltipContent>
        </Tooltip>

        {readOnly ? null : (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('reader.archive')}
                  onClick={() => archive.mutate()}
                  disabled={archive.isPending}
                >
                  <Archive className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('reader.archive')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('reader.delete')}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('reader.delete')}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      <ScrollArea containerClassName="flex max-h-[46%] shrink-0 flex-col" className="border-b px-4 py-4 md:px-6">
        <h1 className="text-base font-semibold leading-snug md:text-lg">{message.subject}</h1>

        <div className="mt-3 flex items-start gap-3">
          <SenderAvatar
            className="mt-0.5 size-9"
            name={message.from?.name}
            email={message.from?.email}
            fallback={message.subject}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              {formatAddress(message.from)}
              {message.accountEmail ? ` · ${message.accountEmail}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('common.to')}: {formatAddressList(message.to, i18n.language) || t('common.none')}
              {message.cc && message.cc.length > 0
                ? ` · ${t('common.cc')}: ${formatAddressList(message.cc, i18n.language)}`
                : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {formatDate(message.receivedAt ?? message.sentAt, i18n.language, undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {message.marked ? (
                <Badge variant="outline">
                  <Star className="size-3 fill-current" aria-hidden="true" />
                  {t('mail.markedIndicator')}
                </Badge>
              ) : null}
              {message.preserved ? (
                <Badge variant="secondary">{t('mail.preservedIndicator')}</Badge>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setDetailsOpen((open) => !open)}
                aria-expanded={detailsOpen}
              >
                <Info className="size-3.5" aria-hidden="true" />
                {detailsOpen ? t('reader.hideDetails') : t('reader.showDetails')}
              </Button>
            </div>
          </div>
        </div>

        {detailsOpen ? (
          <div className="mt-2 space-y-1.5 rounded-lg border bg-muted/30 p-3">
            <DetailRow label={t('common.from')}>{formatAddress(message.from)}</DetailRow>
            <DetailRow label={t('common.to')}>
              {formatAddressList(message.to, i18n.language) || t('common.none')}
            </DetailRow>
            {message.bcc && message.bcc.length > 0 ? (
              <DetailRow label={t('common.bcc')}>
                {formatAddressList(message.bcc, i18n.language)}
              </DetailRow>
            ) : null}
            {message.messageIdHeader ? (
              <DetailRow label={t('reader.messageId')}>{message.messageIdHeader}</DetailRow>
            ) : null}
            {message.mailboxPath ? (
              <DetailRow label={t('archive.originalMailbox')}>{message.mailboxPath}</DetailRow>
            ) : null}
            <DetailRow label={t('common.size')}>{formatBytes(message.size, i18n.language)}</DetailRow>
          </div>
        ) : null}

        {message.preserved ? (
          <p className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t('reader.preserved')}
          </p>
        ) : null}

        {attachments.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t('reader.attachmentsTitle')}
            </p>
            <ul className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    href={messageAttachmentUrl(message.id, attachment.id)}
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
              allowSenderImages(senderEmail);
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
        ) : (
          <MailFrame
            documentHtml={frame.documentHtml}
            title={t('mail.readerPane')}
            className="h-full w-full rounded-xl border bg-card"
          />
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={inTrash ? t('reader.deletePermanentTitle') : t('reader.delete')}
        description={inTrash ? t('reader.deletePermanentConfirm') : t('reader.deleteConfirm')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </motion.div>
  );
}

function ForwardIcon() {
  return <Send className="size-4" aria-hidden="true" />;
}
