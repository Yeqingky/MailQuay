import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  AlertCircle,
  Bold,
  CalendarClock,
  ChevronDown,
  Eraser,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Send,
  Underline,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/common/States';
import type { ComposeSeed } from '@/stores/compose';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatAddress, parseRecipientInput } from '@/lib/mail/address';
import { formatBytes, formatDate, utcToZonedInput, zonedDateTimeToUtc } from '@/lib/format';
import { sanitizeDraftHtml, sanitizeMailHtml, sanitizeQuotedHtml, textToHtml } from '@/lib/mail/sanitize';
import type { Sender } from './senders';
import {
  createDraft,
  draftKeys,
  fetchDraft,
  uploadAttachment,
  type Draft,
  type DraftInput,
} from './draft-api';
import { sendMessage } from './outbox-api';
import { fetchSettings, settingsKeys } from '@/features/settings/api';
import {
  recallSender,
  rememberSender,
  resolveDefaultSender,
  senderName,
  senderReplyTo,
  useSenders,
} from './senders';
import { useDraftSaver } from './useDraftSaver';
import { SenderPicker } from './SenderPicker';
import { COMPOSE_CHANNEL, SEED_STORAGE_PREFIX, draftWindowName } from './useComposeLauncher';
import { parseComposeChannelMessage } from './composeChannel';

type ComposeMode = ComposeSeed['mode'];

function subjectFor(subject: string, mode: ComposeMode): string {
  const trimmed = subject.trim();
  if (mode === 'forward') {
    return /^fwd?:\s*/i.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
  }
  if (mode === 'reply' || mode === 'replyAll') {
    return /^re:\s*/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
  }
  return trimmed;
}

function uniqueEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return result;
}

function quoteFromSeed(
  seed: ComposeSeed,
  locale: string,
  timeZone: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): { html: string; text: string } {
  const message = seed.message;
  if (!message) return { html: '', text: '' };
  const originalHtml = seed.messageBodyHtml
    ? sanitizeQuotedHtml(seed.messageBodyHtml)
    : textToHtml(seed.messageBodyText ?? '');
  const originalText = seed.messageBodyText ?? '';
  const sender = formatAddress(message.from);
  const date = formatDate(message.sentAt ?? message.receivedAt, locale, timeZone, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  if (seed.mode === 'forward') {
    const header = [
      t('compose.forwardHeader'),
      `${t('common.from')}: ${sender}`,
      `${t('common.date')}: ${date}`,
      `${t('common.subject')}: ${message.subject}`,
      `${t('common.to')}: ${(message.to ?? []).map(formatAddress).join(', ')}`,
    ].join('\n');
    return {
      html: `<p>${header.replace(/\n/g, '<br>')}</p><blockquote>${originalHtml}</blockquote>`,
      text: `${header}\n\n${originalText}`,
    };
  }
  const header = t('compose.quoteHeader', { date, sender });
  return {
    html: `<p>${header}</p><blockquote>${originalHtml}</blockquote>`,
    text: `${header}\n\n${originalText}`,
  };
}

function initialFields(
  seed: ComposeSeed,
  sender: Sender,
  locale: string,
  timeZone: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): { to: string; cc: string; subject: string; html: string } {
  const message = seed.message;
  if (!message || seed.mode === 'new') {
    return { to: '', cc: '', subject: '', html: '<p><br></p>' };
  }
  const own = sender.email.toLowerCase();
  const fromEmail = message.from?.email ?? '';
  const toEmails =
    seed.mode === 'forward'
      ? []
      : seed.mode === 'reply'
        ? [fromEmail]
        : uniqueEmails([fromEmail, ...(message.to ?? []).map((entry) => entry.email)]).filter(
            (email) => email.toLowerCase() !== own,
          );
  const ccEmails =
    seed.mode === 'replyAll'
      ? uniqueEmails((message.cc ?? []).map((entry) => entry.email)).filter(
          (email) => email.toLowerCase() !== own && !toEmails.includes(email),
        )
      : [];
  const quote = quoteFromSeed(seed, locale, timeZone, t);
  return {
    to: toEmails.join(', '),
    cc: ccEmails.join(', '),
    subject: subjectFor(message.subject, seed.mode),
    html: `<p><br></p>${quote.html}`,
  };
}

export function ComposeForm({
  seed,
  onClose,
  variant,
  closeRequested = false,
}: {
  seed: ComposeSeed;
  onClose: () => void;
  variant: 'overlay' | 'page';
  closeRequested?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();

  const windowDraftId =
    variant === 'page' && typeof window !== 'undefined'
      ? window.name.startsWith('mailquay-compose:')
        ? window.name.slice('mailquay-compose:'.length)
        : undefined
      : undefined;
  const initialDraftId = seed.draftId ?? windowDraftId;
  const [storedSeed] = useState<ComposeSeed | null>(() => {
    if (!initialDraftId || typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(`${SEED_STORAGE_PREFIX}${initialDraftId}`);
      if (!raw) return null;
      sessionStorage.removeItem(`${SEED_STORAGE_PREFIX}${initialDraftId}`);
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || !('mode' in parsed)) return null;
      return parsed as ComposeSeed;
    } catch {
      return null;
    }
  });
  const effectiveSeed = storedSeed ?? seed;

  const [draftId, setDraftId] = useState<string | undefined>(initialDraftId);
  const draftIdRef = useRef(draftId);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(revision);
  const [sender, setSender] = useState<Sender | null>(null);
  const [replyTo, setReplyTo] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [editorSeed, setEditorSeed] = useState('');
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [attachments, setAttachments] = useState<NonNullable<Draft['attachments']>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const closeRequestedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const sendersQuery = useSenders();
  const settingsQuery = useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings });
  const timezone = settingsQuery.data?.timezone;
  const draftQuery = useQuery({
    queryKey: draftKeys.detail(draftId ?? ''),
    queryFn: () => {
      if (!draftId) throw new Error('No draft');
      return fetchDraft(draftId);
    },
    enabled: Boolean(draftId),
    retry: false,
  });

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  const buildPayload = (): DraftInput | null => {
    if (!sender) return null;
    return {
      accountId: sender.accountId,
      replyTo: replyTo.trim(),
      inReplyTo: effectiveSeed.message?.messageIdHeader,
      to: parseRecipientInput(to),
      cc: parseRecipientInput(cc),
      bcc: parseRecipientInput(bcc),
      subject,
      bodyText: editorRef.current?.innerText ?? '',
      bodyHtml: sanitizeMailHtml(editorRef.current?.innerHTML ?? '').html,
      attachmentIds: attachments.map((attachment) => attachment.id),
    };
  };
  const buildPayloadRef = useRef(buildPayload);
  useEffect(() => {
    buildPayloadRef.current = buildPayload;
  });

  const saver = useDraftSaver({
    enabled: initialized && sender !== null,
    draftId,
    revision,
    getPayload: buildPayload,
    onSaved: (draft) => {
      draftIdRef.current = draft.id;
      revisionRef.current = draft.revision;
      setDraftId(draft.id);
      setRevision(draft.revision);
      setSavedAt(new Date(draft.updatedAt));
      setSaveError(null);
      setAttachments(draft.attachments ?? []);
      if (variant === 'page') window.name = draftWindowName(draft.id);
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      const fields = buildPayloadRef.current();
      if (fields) {
        channelRef.current?.postMessage({
          type: 'draft-saved',
          draftId: draft.id,
          revision: draft.revision,
          fields,
        });
      }
    },
    onError: (error) => setSaveError(message(error)),
    onSavingChange: setSavingDraft,
  });
  const saverRef = useRef(saver);
  useEffect(() => {
    saverRef.current = saver;
  });

  useEffect(() => {
    if (initialized) return;
    if (draftId) {
      if (draftQuery.isPending || sendersQuery.isPending) return;
      if (draftQuery.isError || !draftQuery.data) {
        setInitialized(true);
        return;
      }
      const draft = draftQuery.data;
      const found = sendersQuery.data?.find((entry) => entry.accountId === draft.accountId) ?? null;
      const draftEmpty =
        (draft.to?.length ?? 0) === 0 &&
        (draft.cc?.length ?? 0) === 0 &&
        (draft.bcc?.length ?? 0) === 0 &&
        draft.subject.trim() === '' &&
        (draft.bodyText ?? '').trim() === '' &&
        (draft.bodyHtml ?? '').trim() === '';
      const seedFields =
        storedSeed?.message && storedSeed.mode !== 'new' && found
          ? initialFields(storedSeed, found, i18n.language, timezone, t)
          : null;
      setSender(found);
      setTo(seedFields ? seedFields.to : (draft.to ?? []).join(', '));
      setCc(seedFields ? seedFields.cc : (draft.cc ?? []).join(', '));
      setBcc((draft.bcc ?? []).join(', '));
      setReplyTo(draft.replyTo?.trim() || (found ? senderReplyTo(found) : ''));
      setSubject(seedFields ? seedFields.subject : draft.subject);
      setShowCcBcc(
        (draft.cc?.length ?? 0) > 0 ||
          (draft.bcc?.length ?? 0) > 0 ||
          (seedFields?.cc.length ?? 0) > 0,
      );
      setEditorSeed(seedFields ? seedFields.html : draft.bodyHtml || `<p>${draft.bodyText}</p>`);
      setAttachments(draft.attachments ?? []);
      setRevision(draft.revision);
      revisionRef.current = draft.revision;
      setScheduleValue(utcToZonedInput(draft.scheduledAt, timezone));
      setSavedAt(new Date(draft.updatedAt));
      saverRef.current.prime(draft);
      setInitialized(true);
      if (seedFields && draftEmpty) saverRef.current.schedule();
      return;
    }
    if (sendersQuery.isPending) return;
    if (sendersQuery.isError) {
      setInitialized(true);
      return;
    }
    const preferred = effectiveSeed.message?.accountId ?? effectiveSeed.accountId;
    const chosen = preferred
      ? resolveDefaultSender(sendersQuery.data, preferred) ??
        recallSender(sendersQuery.data) ??
        resolveDefaultSender(sendersQuery.data)
      : recallSender(sendersQuery.data) ?? resolveDefaultSender(sendersQuery.data);
    if (!chosen) {
      setInitialized(true);
      return;
    }
    const fields = initialFields(
      effectiveSeed,
      chosen,
      i18n.language,
      timezone,
      t,
    );
    setSender(chosen);
    setTo(fields.to);
    setCc(fields.cc);
    setBcc('');
    setReplyTo(senderReplyTo(chosen));
    setShowCcBcc(false);
    setSubject(fields.subject);
    setEditorSeed(fields.html);
    setInitialized(true);
    rememberSender(chosen);
  }, [
    draftId,
    draftQuery.data,
    draftQuery.isError,
    draftQuery.isPending,
    effectiveSeed,
    sendersQuery.data,
    sendersQuery.isError,
    sendersQuery.isPending,
    i18n.language,
    initialized,
    storedSeed,
    t,
    timezone,
  ]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== editorSeed) {
      editorRef.current.innerHTML = sanitizeDraftHtml(editorSeed);
    }
  }, [editorSeed]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(COMPOSE_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const data = parseComposeChannelMessage(event.data);
      if (!data) return;
      if (data.type === 'query' && data.draftId === draftIdRef.current) {
        channel.postMessage({ type: 'open', draftId: data.draftId });
        window.focus();
        return;
      }
      if (data.type === 'draft-sent' && data.draftId === draftIdRef.current) {
        saverRef.current.cancel();
        onCloseRef.current();
        return;
      }
      if (
        data.type === 'draft-saved' &&
        data.draftId === draftIdRef.current &&
        data.revision > revisionRef.current &&
        document.activeElement !== editorRef.current
      ) {
        revisionRef.current = data.revision;
        setRevision(data.revision);
        setTo((data.fields.to ?? []).join(', '));
        setCc((data.fields.cc ?? []).join(', '));
        setBcc((data.fields.bcc ?? []).join(', '));
        setSubject(data.fields.subject);
        setReplyTo((data.fields.replyTo ?? '').trim());
        setEditorSeed(data.fields.bodyHtml);
        setSavedAt(new Date());
        setSaveError(null);
        saverRef.current.markClean();
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      if (initialized && sender) void saverRef.current.flush();
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [sender, initialized]);

  const touch = () => {
    setSaveError(null);
    saver.schedule();
  };

  const handleUploads = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setActionError(null);
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadAttachment(file)));
      setAttachments((previous) => [...previous, ...uploaded]);
      touch();
    } catch (error) {
      setActionError(`${t('compose.uploadFailed')} ${message(error)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId));
    touch();
  };

  const selectSender = (next: Sender) => {
    rememberSender(next);
    setSender(next);
    setReplyTo(senderReplyTo(next));
    touch();
  };

  const requestClose = async () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setClosing(true);
    try {
      if (sender) await saver.flush();
    } catch {
      closeRequestedRef.current = false;
      setClosing(false);
      return;
    }
    saver.cancel();
    onClose();
  };

  useEffect(() => {
    if (closeRequested) void requestClose();
    // requestClose is intentionally read once when the parent requests closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeRequested]);

  const runSend = async (scheduledDateTime?: string) => {
    setActionError(null);
    if (!sender) {
      setActionError(t('compose.senderRequired'));
      return;
    }
    const recipients = parseRecipientInput(to);
    if (recipients.length === 0) {
      setActionError(t('compose.recipientsRequired'));
      return;
    }
    if (subject.trim() === '') {
      setActionError(t('compose.subjectRequired'));
      return;
    }
    let scheduledAt: string | undefined;
    if (scheduledDateTime !== undefined) {
      const utc = zonedDateTimeToUtc(scheduledDateTime, timezone);
      if (!utc || utc.getTime() <= Date.now()) {
        setActionError(t('compose.scheduleInvalid'));
        return;
      }
      scheduledAt = utc.toISOString();
    }
    setSending(true);
    try {
      const saved = await saver.flush();
      let id = saved?.id ?? draftIdRef.current;
      if (!id) {
        const payload = buildPayloadRef.current();
        if (!payload) throw new Error(t('compose.senderRequired'));
        const created = await createDraft(payload);
        id = created.id;
        draftIdRef.current = created.id;
        setDraftId(created.id);
        setRevision(created.revision);
        saver.prime(created);
      }
      await sendMessage({ draftId: id, scheduledAt });
      toast(scheduledAt ? t('compose.scheduledSuccess') : t('compose.sendSuccess'));
      channelRef.current?.postMessage({ type: 'draft-sent', draftId: id });
      saver.cancel();
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['outbox'] });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setScheduleOpen(false);
      onClose();
    } catch (error) {
      const description = message(error);
      setActionError(description);
      toast(t('compose.sendError'), { description, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const format = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    touch();
  };

  const modeTitle =
    effectiveSeed.mode === 'reply'
      ? t('compose.replyTitle')
      : effectiveSeed.mode === 'replyAll'
        ? t('compose.replyAllTitle')
        : effectiveSeed.mode === 'forward'
          ? t('compose.forwardTitle')
          : t('compose.newTitle');

  if (
    (draftId && draftQuery.isPending) ||
    (!draftId && sendersQuery.isPending) ||
    (!initialized && settingsQuery.isPending)
  ) {
    return <LoadingState label={t('app.loading')} />;
  }

  if (!draftId && sendersQuery.isError) {
    return <ErrorState error={sendersQuery.error} onRetry={() => void sendersQuery.refetch()} />;
  }

  if (draftId && draftQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <ErrorState error={draftQuery.error} onRetry={() => void draftQuery.refetch()} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraftId(undefined);
            draftIdRef.current = undefined;
            setInitialized(false);
            setSender(null);
            setEditorSeed('');
            if (typeof window !== 'undefined') window.name = '';
          }}
        >
          {t('compose.newDraft')}
        </Button>
      </div>
    );
  }

  if (!sender) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-end border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('compose.close')}
            onClick={() => void requestClose()}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-medium">{t('compose.noAccounts')}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/accounts">{t('settings.nav.accounts')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const selectedSender = sender;

  const statusText = savingDraft
    ? t('compose.savingDraft')
    : saveError
      ? saveError
      : savedAt
        ? t('compose.savedAt', {
            time: formatDate(savedAt.toISOString(), i18n.language, timezone, {
              timeStyle: 'short',
            }),
          })
        : t('compose.newDraft');

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex items-center">
          <Button
            size="sm"
            className="gap-1.5 rounded-r-none"
            onClick={() => void runSend()}
            disabled={sending || closing}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            {sending ? t('compose.sending') : t('compose.send')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                aria-label={t('common.more')}
                disabled={sending || closing}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={() => {
                  setScheduleValue(
                    scheduleValue || utcToZonedInput(new Date().toISOString(), timezone),
                  );
                  setScheduleOpen(true);
                }}
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                {t('compose.scheduleSend')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void runSend()}>
                <Send className="size-4" aria-hidden="true" />
                {t('compose.sendNow')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-medium">{subject || modeTitle}</p>
          <p className="truncate text-[11px] text-muted-foreground">{statusText}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('compose.close')}
          onClick={() => void requestClose()}
          disabled={closing}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <ScrollArea containerClassName="min-h-0 flex-1" className="px-4 py-3">
        {effectiveSeed.message?.preserved ? (
          <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t('compose.localCopyWarning')}
          </div>
        ) : null}
        {actionError ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{t('compose.from')}</span>
            <SenderPicker
              senders={sendersQuery.data ?? []}
              value={selectedSender}
              onSelect={selectSender}
            >
              <button
                type="button"
                className="inline-flex max-w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('compose.chooseSender')}
              >
                <span className="min-w-0 truncate">
                  {senderName(selectedSender)} &lt;{selectedSender.email}&gt;
                </span>
                <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
              </button>
            </SenderPicker>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="compose-reply-to" className="w-14 shrink-0 text-xs font-normal text-muted-foreground">
              {t('compose.replyTo')}
            </Label>
            <Input
              id="compose-reply-to"
              value={replyTo}
              onChange={(event) => {
                setReplyTo(event.target.value);
                touch();
              }}
              aria-label={t('compose.replyTo')}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="compose-to" className="w-14 shrink-0 text-xs font-normal text-muted-foreground">
              {t('compose.to')}
            </Label>
            <Input
              id="compose-to"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                touch();
              }}
              aria-label={t('compose.to')}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs"
              onClick={() => setShowCcBcc((value) => !value)}
              aria-expanded={showCcBcc}
            >
              {showCcBcc ? t('compose.hideCc') : t('compose.showCc')}
            </Button>
          </div>

          {showCcBcc ? (
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="compose-cc" className="w-14 shrink-0 text-xs font-normal text-muted-foreground">
                  {t('compose.cc')}
                </Label>
                <Input
                  id="compose-cc"
                  value={cc}
                  onChange={(event) => {
                    setCc(event.target.value);
                    touch();
                  }}
                  aria-label={t('compose.cc')}
                  autoComplete="off"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="compose-bcc" className="w-14 shrink-0 text-xs font-normal text-muted-foreground">
                  {t('compose.bcc')}
                </Label>
                <Input
                  id="compose-bcc"
                  value={bcc}
                  onChange={(event) => {
                    setBcc(event.target.value);
                    touch();
                  }}
                  aria-label={t('compose.bcc')}
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}

          <div className="flex items-center gap-2">
            <Label htmlFor="compose-subject" className="w-14 shrink-0 text-xs font-normal text-muted-foreground">
              {t('compose.subject')}
            </Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value);
                touch();
              }}
              placeholder={t('compose.subjectPlaceholder')}
              aria-label={t('compose.subject')}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => void handleUploads(event.target.files)}
            aria-label={t('compose.attachFiles')}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip className="size-3.5" aria-hidden="true" />
            )}
            {uploading ? t('compose.uploading') : t('compose.attachFiles')}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {t('compose.attachmentsTitle')}
          </span>
        </div>

        {attachments.length > 0 ? (
          <div className="mt-2 rounded-lg border bg-muted/30 p-2.5">
            <ul className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
                    <Paperclip className="size-3 text-muted-foreground" aria-hidden="true" />
                    <span className="max-w-56 truncate">{attachment.filename}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(attachment.size, i18n.language)}
                    </span>
                    <button
                      type="button"
                      aria-label={t('compose.removeAttachment', { name: attachment.filename })}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1 border-b py-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('compose.bold')} onClick={() => format('bold')}>
            <Bold className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('compose.italic')} onClick={() => format('italic')}>
            <Italic className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('compose.underline')}
            onClick={() => format('underline')}
          >
            <Underline className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('compose.bulletList')}
            onClick={() => format('insertUnorderedList')}
          >
            <List className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('compose.numberedList')}
            onClick={() => format('insertOrderedList')}
          >
            <ListOrdered className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('compose.clearFormatting')}
            onClick={() => format('removeFormat')}
          >
            <Eraser className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={t('compose.body')}
          data-placeholder={t('compose.bodyPlaceholder')}
          suppressContentEditableWarning
          onInput={() => {
            touch();
          }}
          className="compose-editor min-h-64 w-full px-1 py-3 text-sm leading-relaxed outline-none [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:max-w-full"
        />
      </ScrollArea>

      {saveError ? (
        <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-1.5 text-[11px] text-destructive" role="alert">
          {saveError}
        </div>
      ) : null}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('compose.scheduleSend')}</DialogTitle>
            <DialogDescription>
              {t('compose.scheduleHint', { timezone: timezone ?? 'UTC' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="compose-schedule-at">{t('compose.scheduleLabel')}</Label>
            <Input
              id="compose-schedule-at"
              type="datetime-local"
              value={scheduleValue}
              min={utcToZonedInput(new Date().toISOString(), timezone)}
              onChange={(event) => setScheduleValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void runSend(scheduleValue)}
              disabled={sending || scheduleValue === ''}
            >
              {t('compose.scheduling')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
