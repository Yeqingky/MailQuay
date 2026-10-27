import * as React from 'react';
import { cn } from '@/lib/utils';

type ScrollAreaTag = 'div' | 'nav' | 'section' | 'ul';

interface ScrollBarMetrics {
  height: number;
  top: number;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

export function useOverlayScrollbar() {
  const ref = React.useRef<HTMLElement | null>(null);
  const [bar, setBar] = React.useState<ScrollBarMetrics | null>(null);
  const [active, setActive] = React.useState(false);
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const hovered = React.useRef(false);
  const hideTimer = React.useRef<number | undefined>(undefined);
  const frame = React.useRef<number | null>(null);

  const attach = React.useCallback((element: HTMLElement | null) => {
    ref.current = element;
    setNode(element);
  }, []);

  const measure = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const { clientHeight, scrollHeight, scrollTop } = node;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 1) {
      setBar((previous) => (previous === null ? previous : null));
      return;
    }
    const height = Math.min(
      clientHeight,
      Math.max(24, (clientHeight / scrollHeight) * clientHeight),
    );
    const offset = Math.min(Math.max(scrollTop, 0), overflow);
    const top = (offset / overflow) * (clientHeight - height);
    setBar((previous) =>
      previous &&
      Math.abs(previous.height - height) < 0.5 &&
      Math.abs(previous.top - top) < 0.5
        ? previous
        : { height, top },
    );
  }, [ref]);

  const scheduleMeasure = React.useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      measure();
    });
  }, [measure]);

  const reveal = React.useCallback(() => {
    setActive(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!hovered.current) setActive(false);
    }, 900);
  }, []);

  React.useEffect(() => {
    if (!node) return;
    measure();

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleMeasure());
    const observeChildren = () => {
      if (!observer) return;
      observer.disconnect();
      observer.observe(node);
      for (const child of Array.from(node.children)) observer.observe(child);
    };
    observeChildren();

    const mutation =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            observeChildren();
            scheduleMeasure();
          });
    mutation?.observe(node, { childList: true });

    return () => {
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(hideTimer.current);
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [measure, node, scheduleMeasure]);

  return {
    attach,
    bar,
    active,
    onPointerEnter: () => {
      hovered.current = true;
      window.clearTimeout(hideTimer.current);
      setActive(true);
      scheduleMeasure();
    },
    onPointerLeave: () => {
      hovered.current = false;
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setActive(false), 900);
    },
    onScroll: () => {
      scheduleMeasure();
      reveal();
    },
  };
}

export function ScrollbarThumb({
  bar,
  active,
  variant = 'overlay',
}: {
  bar: ScrollBarMetrics | null;
  active: boolean;
  variant?: 'overlay' | 'sticky';
}) {
  if (!bar) return null;
  const thumb = (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-0 z-10 w-1 rounded-full bg-muted-foreground/40 transition-opacity duration-200 motion-reduce:transition-none',
        active ? 'opacity-100' : 'opacity-0',
      )}
      style={{ height: bar.height, top: bar.top }}
    />
  );
  if (variant === 'sticky') {
    return (
      <div aria-hidden="true" className="pointer-events-none sticky top-0 h-0">
        {thumb}
      </div>
    );
  }
  return thumb;
}

type ScrollAreaProps<T extends ScrollAreaTag> = {
  as?: T;
  containerClassName?: string;
  ref?: React.Ref<HTMLElementTagNameMap[T]>;
} & Omit<React.HTMLAttributes<HTMLElementTagNameMap[T]>, 'ref'>;

export function ScrollArea<T extends ScrollAreaTag = 'div'>({
  as,
  containerClassName,
  className,
  children,
  ref,
  onScroll,
  ...props
}: ScrollAreaProps<T>) {
  const { attach, bar, active, onPointerEnter, onPointerLeave, onScroll: onViewportScroll } =
    useOverlayScrollbar();
  const Viewport = (as ?? 'div') as React.ElementType;

  const setViewport = React.useCallback(
    (node: HTMLElement | null) => {
      attach(node);
      assignRef(ref, node as HTMLElementTagNameMap[T] | null);
    },
    [attach, ref],
  );

  return (
    <div
      className={cn('relative flex min-h-0 flex-col', containerClassName)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <Viewport
        ref={setViewport}
        className={cn('scrollbar-none min-h-0 flex-1 overflow-y-auto', className)}
        onScroll={(event: React.UIEvent<HTMLElement>) => {
          onViewportScroll();
          onScroll?.(event as React.UIEvent<HTMLElementTagNameMap[T]>);
        }}
        {...props}
      >
        {children}
      </Viewport>
      <ScrollbarThumb bar={bar} active={active} />
    </div>
  );
}
