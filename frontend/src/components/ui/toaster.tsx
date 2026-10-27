import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastVariant } from './toast';

const STATUS_ICONS: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: CircleAlert,
};

const STATUS_COLORS: Record<ToastVariant, string> = {
  default: 'text-task-fetch',
  success: 'text-task-sync',
  destructive: 'text-destructive',
};

export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const pause = useToastStore((state) => state.pause);
  const resume = useToastStore((state) => state.resume);
  const [expanded, setExpanded] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const measure = useCallback(() => {
    setHeights((previous) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const [id, element] of cardRefs.current) {
        const height = element.offsetHeight;
        next[id] = height;
        if (previous[id] !== height) changed = true;
      }
      return changed ? next : previous;
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, toasts]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    for (const element of cardRefs.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [measure, toasts]);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="toast-stack pointer-events-auto fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-[80] flex w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 flex-col sm:bottom-6 sm:left-auto sm:right-4 sm:translate-x-0"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        setExpanded(true);
        pause();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        setExpanded(false);
        resume();
      }}
      onFocusCapture={() => {
        setExpanded(true);
        pause();
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setExpanded(false);
        resume();
      }}
    >
      {toasts
        .slice()
        .reverse()
        .map((item, index) => {
          const Icon = STATUS_ICONS[item.variant];
          return (
            <div
              key={item.id}
              ref={(node) => {
                if (node) cardRefs.current.set(item.id, node);
                else cardRefs.current.delete(item.id);
              }}
              role={item.variant === 'destructive' ? 'alert' : 'status'}
              data-state={item.dismissing ? 'dismissing' : 'visible'}
              className="toast-item flex items-center gap-2.5 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg transition-[margin-top] duration-200 ease-out motion-reduce:transition-none"
              style={{
                marginTop:
                  index === 0 ? 0 : expanded ? 4 : -Math.max(0, (heights[item.id] ?? 56) - 12),
                zIndex: toasts.length - index,
              }}
            >
              <Icon
                className={cn('size-5 shrink-0', STATUS_COLORS[item.variant])}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="toast-title line-clamp-1 text-[13px] font-medium leading-5">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="toast-desc mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
    </div>
  );
}
