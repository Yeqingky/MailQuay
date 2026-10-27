import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  idPrefix: string;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  label,
  idPrefix,
  className,
}: TabsProps<T>) {
  const refs = React.useRef(new Map<T, HTMLButtonElement>());

  const select = (next: T) => {
    onValueChange(next);
    refs.current.get(next)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;
    let next: T | null = null;
    if (event.key === 'ArrowRight') next = items[(index + 1) % items.length].value;
    else if (event.key === 'ArrowLeft') next = items[(index - 1 + items.length) % items.length].value;
    else if (event.key === 'Home') next = items[0].value;
    else if (event.key === 'End') next = items[items.length - 1].value;
    if (next === null) return;
    event.preventDefault();
    select(next);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex w-full items-center gap-1 rounded-lg bg-muted p-1', className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              if (node) refs.current.set(item.value, node);
              else refs.current.delete(item.value);
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={selected ? `${idPrefix}-panel-${item.value}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-xs font-medium transition-colors sm:px-2 sm:text-sm',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
