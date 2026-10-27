import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('py-3.5 first:pt-0', className)}>
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  control,
  htmlFor,
  className,
}: {
  title: string;
  description?: string;
  control: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4 py-1.5', className)}>
      <div className="min-w-48 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] font-medium">
            {title}
          </label>
        ) : (
          <p className="text-[13px] font-medium">{title}</p>
        )}
        {description ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

export function SettingsDivider() {
  return <Separator className="my-1" />;
}
