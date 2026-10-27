import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-5" aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <div
      role="alert"
      className={cn(
        'flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title ?? t('common.loadingFailed')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message(error)}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={cn(
        'flex h-full min-h-32 items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}
