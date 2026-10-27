import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useComposeStore, type ComposeSeed } from '@/stores/compose';
import { ComposeForm } from './ComposeForm';

export function ComposeOverlay({ seed }: { seed: ComposeSeed | null }) {
  const { t } = useTranslation();
  const closeCompose = useComposeStore((state) => state.closeCompose);
  const [closeRequested, setCloseRequested] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) setCloseRequested(true);
      }}
    >
      <DialogContent
        hideClose
        className="left-0 top-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 md:left-auto md:right-6 md:top-1/2 md:h-auto md:max-h-[calc(100dvh-3rem)] md:min-h-[560px] md:w-[min(760px,calc(100vw-3rem))] md:-translate-y-1/2 md:translate-x-0 md:rounded-xl md:border"
      >
        <DialogTitle className="sr-only">{t('compose.windowTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{t('compose.bodyFields')}</DialogDescription>
        {seed ? (
          <ComposeForm
            seed={seed}
            variant="overlay"
            closeRequested={closeRequested}
            onClose={closeCompose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
