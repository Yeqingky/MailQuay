import * as React from 'react';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// CredentialField renders a single-line plain-text area instead of an input.
// Password managers and browser autofill target input elements, so a textarea
// keeps mailbox credentials out of their heuristics. Newlines are stripped on
// input to keep the value single-line.
export const CredentialField = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(function CredentialField({ className, onChange, ...props }, ref) {
  return (
    <Textarea
      {...props}
      ref={ref}
      rows={1}
      wrap="off"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      data-form-type="other"
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="1"
      data-protonpass-ignore="true"
      onChange={(event) => {
        const next = event.target.value.replace(/[\r\n]+/g, '');
        if (next !== event.target.value) {
          event.target.value = next;
        }
        onChange?.(event);
      }}
      className={cn(
        'h-9 min-h-0 resize-none overflow-hidden px-3 py-1.5 leading-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    />
  );
});
