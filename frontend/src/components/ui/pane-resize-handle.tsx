import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { clamp } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PaneResizeHandle({
  width,
  min,
  reserve = 0,
  label,
  onResize,
  className,
}: {
  width: number;
  min: number;
  /** Space this pane must leave for the panes after the handle, in pixels. */
  reserve?: number;
  label: string;
  onResize: (width: number) => void;
  className?: string;
}) {
  const handleRef = useRef<HTMLDivElement | null>(null);

  const paneWidth = () =>
    handleRef.current?.previousElementSibling?.getBoundingClientRect().width ?? width;

  const maxWidth = () => {
    const parentWidth = handleRef.current?.parentElement?.getBoundingClientRect().width ?? 0;
    return Math.max(min, parentWidth - reserve);
  };

  const apply = (value: number) => onResize(clamp(Math.round(value), min, maxWidth()));

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = paneWidth();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      apply(startWidth + moveEvent.clientX - startX);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width > 0 ? Math.round(width) : undefined}
      aria-valuemin={min}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -10 : 10;
        apply(paneWidth() + delta);
      }}
      className={cn(
        'group relative hidden w-1 shrink-0 cursor-col-resize touch-none bg-transparent select-none md:block',
        className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-px bg-border transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary" />
    </div>
  );
}
