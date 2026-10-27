import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, PenLine, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { toast } from '@/components/ui/toast';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatAddress } from '@/lib/mail/address';
import { formatDate } from '@/lib/format';
import { deleteDraft, draftKeys, fetchDrafts, type Draft } from '@/features/compose/draft-api';
import { useComposeLauncher } from '@/features/compose/useComposeLauncher';

export function DraftsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const { launch } = useComposeLauncher();
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null);
  useDocumentTitle(t('drafting.title'));

  const query = useQuery({ queryKey: draftKeys.list(), queryFn: () => fetchDrafts() });
  const remove = useMutation({
    mutationFn: (id: string) => deleteDraft(id),
    onSuccess: () => {
      toast(t('drafting.deleted'));
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    },
    onError: (error) =>
      toast(t('common.deleteFailed'), { description: message(error), variant: 'destructive' }),
  });

  const drafts = query.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b px-4 py-2 md:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">{t('drafting.title')}</h1>
          <p className="text-xs text-muted-foreground">
            {t('mail.messageCount', { count: drafts.length })}
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
        <Button
          size="sm"
          className="gap-2"
          onClick={() => void launch({ mode: 'new' })}
        >
          <PenLine className="size-4" aria-hidden="true" />
          {t('topbar.compose')}
        </Button>
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" aria-hidden="true" />}
          title={t('drafting.emptyTitle')}
          description={t('drafting.emptyBody')}
          action={
            <Button size="sm" onClick={() => void launch({ mode: 'new' })}>
              {t('topbar.compose')}
            </Button>
          }
        />
      ) : (
        <ScrollArea containerClassName="min-h-0 flex-1">
          <ul className="divide-y">
            {drafts.map((draft) => {
              const recipients = [...(draft.to ?? []), ...(draft.cc ?? []), ...(draft.bcc ?? [])];
              return (
                <li key={draft.id} className="flex items-start gap-3 px-4 py-3 md:px-6">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void launch({ draftId: draft.id, mode: 'new' })}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <FileText className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {draft.subject || t('drafting.noSubject')}
                        </span>
                        <Badge
                          variant={draft.status === 'failed' || draft.status === 'copy_failed' ? 'destructive' : 'muted'}
                        >
                          {t(`drafting.statuses.${draft.status}`)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {recipients.length > 0
                          ? recipients
                              .map((email) => formatAddress({ email }))
                              .join(', ')
                          : t('drafting.noRecipients')}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground/80">
                        {draft.bodyText}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t('drafting.lastEdited', {
                          date: formatDate(draft.updatedAt, i18n.language, undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        })}
                      </p>
                      {draft.lastError ? (
                        <p className="mt-1 text-[11px] text-destructive">{draft.lastError}</p>
                      ) : null}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void launch({ draftId: draft.id, mode: 'new' })}
                    >
                      {t('common.open')}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('drafting.delete')}
                          onClick={() => setPendingDelete(draft)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('drafting.delete')}</TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t('drafting.delete')}
        description={t('drafting.deleteConfirm')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}
