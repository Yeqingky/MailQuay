import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { DialogOverlay, DialogPortal } from './dialog';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

interface SheetContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  side?: 'left' | 'right';
  closeLabel: string;
  title: string;
  description?: string;
}

export function SheetContent({
  className,
  children,
  side = 'left',
  closeLabel,
  title,
  description,
  ...props
}: SheetContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex h-full w-[var(--sidebar-width)] flex-col border-border bg-background shadow-xl focus:outline-none',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          {description ?? title}
        </DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute right-2 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
