import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SecurityInfo } from '@/lib/api/security';

export function InsecureTransportBanner({ security }: { security?: SecurityInfo }) {
  const { t } = useTranslation();
  if (!security?.insecureTransport) return null;
  return (
    <div
      role="alert"
      data-testid="insecure-transport-banner"
      className="flex w-full items-start gap-2 border-b border-destructive bg-destructive px-4 py-2 text-destructive-foreground"
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-xs sm:text-sm">
        <p className="font-semibold">{t('auth.insecureTransportTitle')}</p>
        <p className="opacity-90">{t('auth.insecureTransportBody')}</p>
      </div>
    </div>
  );
}

export function InlineWarning({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive',
        className,
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
