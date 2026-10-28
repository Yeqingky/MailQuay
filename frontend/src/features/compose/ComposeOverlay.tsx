import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useComposeStore, type ComposeSeed } from '@/stores/compose';
import { SPRING_SOFT } from '@/lib/motion';
import { ComposeForm } from './ComposeForm';

export function ComposeOverlay() {
  const { t } = useTranslation();
  const isOpen = useComposeStore((state) => state.isOpen);
  const seed = useComposeStore((state) => state.seed);
  const closeCompose = useComposeStore((state) => state.closeCompose);
  const [visibleSeed, setVisibleSeed] = useState<ComposeSeed | null>(seed);
  const [closeRequested, setCloseRequested] = useState(false);
  const activeSeed = seed ?? visibleSeed;

  useEffect(() => {
    if (seed) setVisibleSeed(seed);
  }, [seed]);

  useEffect(() => {
    if (isOpen) setCloseRequested(false);
  }, [isOpen]);

  return (
    <AnimatePresence onExitComplete={() => setVisibleSeed(null)}>
      {isOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setCloseRequested(true);
          }}
        >
          <DialogContent
            hideClose
            motionProps={{
              initial: { opacity: 0, y: 32 },
              animate: { opacity: 1, y: 0 },
              exit: {
                opacity: 0,
                y: 24,
                transition: { duration: 0.18, ease: 'easeIn' },
              },
              transition: SPRING_SOFT,
            }}
            className="left-0 top-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 md:left-auto md:right-6 md:top-1/2 md:h-auto md:max-h-[calc(100dvh-3rem)] md:min-h-[560px] md:w-[min(760px,calc(100vw-3rem))] md:-translate-y-1/2 md:translate-x-0 md:rounded-xl md:border"
          >
            <DialogTitle className="sr-only">{t('compose.windowTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('compose.bodyFields')}</DialogDescription>
            {activeSeed ? (
              <ComposeForm
                seed={activeSeed}
                variant="overlay"
                closeRequested={closeRequested}
                onClose={closeCompose}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </AnimatePresence>
  );
}
