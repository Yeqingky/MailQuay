import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay asChild {...props}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] dark:bg-black/50', className)}
      />
    </DialogPrimitive.Overlay>
  );
}

interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
  closeLabel?: string;
  motionProps?: HTMLMotionProps<'div'>;
}

export function DialogContent({
  className,
  children,
  hideClose = false,
  closeLabel = 'Close',
  motionProps,
  ...props
}: DialogContentProps) {
  const classes = cn(
    'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg focus:outline-none',
    className,
  );
  const content = (
    <>
      {children}
      {!hideClose ? (
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      ) : null}
    </>
  );

  return (
    <DialogPortal>
      <DialogOverlay />
      {motionProps ? (
        <DialogPrimitive.Content asChild {...props}>
          <motion.div
            {...motionProps}
            className={cn(classes, motionProps.className)}
          >
            {content}
          </motion.div>
        </DialogPrimitive.Content>
      ) : (
        <DialogPrimitive.Content className={classes} {...props}>
          {content}
        </DialogPrimitive.Content>
      )}
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)} {...props} />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold leading-none', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
