import type { CSSProperties, ReactNode } from 'react';
import { MailOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/common/States';
import { PaneResizeHandle } from '@/components/ui/pane-resize-handle';
import { LIST_MIN_WIDTH, PANE_RESIZE_HANDLE_WIDTH, READER_MIN_WIDTH } from '@/lib/paneLayout';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

interface ListWidthStyle extends CSSProperties {
  '--mail-list-width': string;
}

export function MailSplit({
  list,
  reader,
  hasSelection,
}: {
  list: ReactNode;
  reader: ReactNode;
  hasSelection: boolean;
}) {
  const { t } = useTranslation();
  const mobilePane = useUiStore((state) => state.mobilePane);
  const listWidth = useUiStore((state) => state.listWidth);
  const setListWidth = useUiStore((state) => state.setListWidth);
  const style: ListWidthStyle = {
    '--mail-list-width': listWidth > 0 ? `${listWidth}px` : 'clamp(320px, 28vw, 420px)',
  };

  return (
    <div className="flex min-h-0 flex-1" style={style}>
      <section
        aria-label={t('mail.listPane')}
        className={cn(
          'flex min-h-0 w-full flex-col border-r bg-background md:w-[var(--mail-list-width)] md:shrink-0 lg:max-w-[calc(100%-364px)]',
          hasSelection && mobilePane === 'reader' && 'hidden md:flex',
        )}
      >
        {list}
      </section>
      <PaneResizeHandle
        width={listWidth}
        min={LIST_MIN_WIDTH}
        reserve={READER_MIN_WIDTH + PANE_RESIZE_HANDLE_WIDTH}
        label={t('mail.resizeList')}
        onResize={setListWidth}
      />
      <section
        aria-label={t('mail.readerPane')}
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col',
          hasSelection && mobilePane === 'reader' ? 'flex' : 'hidden md:flex',
        )}
      >
        {hasSelection ? (
          reader
        ) : (
          <EmptyState
            icon={<MailOpen className="size-5" aria-hidden="true" />}
            title={t('reader.noSelectionTitle')}
            description={t('reader.noSelectionBody')}
            className="h-full"
          />
        )}
      </section>
    </div>
  );
}
