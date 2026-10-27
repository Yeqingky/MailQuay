import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { senderName, type Sender } from './senders';

export function SenderPicker({
  senders,
  value,
  onSelect,
  children,
}: {
  senders: Sender[];
  value: Sender | null;
  onSelect: (sender: Sender) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-1">
        <ScrollArea className="max-h-72" role="listbox" aria-label={t('compose.chooseSender')}>
          {senders.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('compose.senderEmpty')}
            </p>
          ) : (
            senders.map((sender) => {
              const selected = value?.accountId === sender.accountId;
              return (
                <button
                  key={sender.accountId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(sender)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                    selected && 'bg-accent/70',
                  )}
                >
                  <span className="flex size-4 items-center justify-center">
                    {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {senderName(sender)} &lt;{sender.email}&gt;
                  </span>
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
