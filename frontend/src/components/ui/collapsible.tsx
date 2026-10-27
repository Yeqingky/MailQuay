import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export function CollapsibleContent({
  animated = true,
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content> & {
  animated?: boolean;
}) {
  return (
    <CollapsiblePrimitive.Content
      className={cn(
        'overflow-hidden',
        animated &&
          'data-[state=open]:animate-[collapsible-down_200ms_ease-out] data-[state=closed]:animate-[collapsible-up_200ms_ease-in] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
