import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InsecureTransportBanner } from '@/components/layout/InsecureTransportBanner';
import { useAuthStatus } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { ComposeSeed } from '@/stores/compose';
import { ComposeForm } from '@/features/compose/ComposeForm';

export function ComposePage() {
  const { t } = useTranslation();
  const auth = useAuthStatus();
  useDocumentTitle(t('compose.windowTitle'));
  const [seed] = useState<ComposeSeed>(() => {
    const prefix = 'mailquay-compose:';
    const draftId =
      typeof window !== 'undefined' && window.name.startsWith(prefix)
        ? window.name.slice(prefix.length)
        : undefined;
    return { mode: 'new', draftId };
  });

  const closeWindow = () => {
    window.name = '';
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign('/');
    }, 60);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <InsecureTransportBanner security={auth.data?.security} />
      <div className="min-h-0 flex-1">
        <ComposeForm seed={seed} variant="page" onClose={closeWindow} />
      </div>
    </div>
  );
}
