import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { fetchAccounts } from '@/features/accounts/api';
import { createDraft } from '@/features/compose/draft-api';
import { fetchSettings, settingsKeys } from '@/features/settings/api';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useComposeStore, type ComposeSeed } from '@/stores/compose';

export const COMPOSE_CHANNEL = 'mailquay-compose';
export const WINDOW_NAME_PREFIX = 'mailquay-compose:';
export const SEED_STORAGE_PREFIX = 'mailquay:compose-seed:';
const WINDOW_FEATURES = 'popup=yes,width=1040,height=780';

export function draftWindowName(draftId: string): string {
  return `${WINDOW_NAME_PREFIX}${draftId}`;
}

export function parseDraftWindowName(name: string): string | undefined {
  return name.startsWith(WINDOW_NAME_PREFIX) ? name.slice(WINDOW_NAME_PREFIX.length) : undefined;
}

function existingComposeWindowIsOpen(handle: Window): boolean {
  try {
    return handle.location.pathname === '/compose';
  } catch {
    return false;
  }
}

export function useComposeLauncher() {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const openCompose = useComposeStore((state) => state.openCompose);
  const settings = useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings });

  const launch = useCallback(
    async (seed: ComposeSeed = { mode: 'new' }) => {
      const composeWindowMode = settings.data?.composeWindowMode ?? 'in_app';
      if (composeWindowMode === 'in_app') {
        openCompose(seed);
        return;
      }

      if (seed.draftId) {
        // Opening with an empty URL focuses an existing named window without
        // navigating it, so unsaved content in that window is preserved.
        const opened = window.open('', draftWindowName(seed.draftId), WINDOW_FEATURES);
        if (!opened) {
          openCompose(seed);
          return;
        }
        if (existingComposeWindowIsOpen(opened)) {
          opened.focus();
          return;
        }
        opened.location.assign('/compose');
        opened.focus();
        return;
      }

      // A popup must be opened synchronously from the click. The draft is
      // created afterwards and then handed to this placeholder window.
      const placeholderName = `${WINDOW_NAME_PREFIX}new:${Date.now()}`;
      const opened = window.open('', placeholderName, WINDOW_FEATURES);
      if (!opened) {
        openCompose(seed);
        return;
      }
      try {
        const accounts = await fetchAccounts();
        if (accounts.length === 0) {
          opened.close();
          toast(t('compose.noAccounts'), { variant: 'destructive' });
          return;
        }
        const preferred = seed.accountId ?? seed.message?.accountId;
        const account =
          accounts.find((entry) => entry.id === preferred) ?? accounts[0];
        const draft = await createDraft({
          accountId: account.id,
          subject: '',
          bodyText: '',
          bodyHtml: '',
        });
        if (seed.mode !== 'new' || seed.message) {
          sessionStorage.setItem(`${SEED_STORAGE_PREFIX}${draft.id}`, JSON.stringify(seed));
        }
        opened.name = draftWindowName(draft.id);
        opened.location.assign('/compose');
        opened.focus();
      } catch (error) {
        opened.close();
        toast(t('common.error'), { description: message(error), variant: 'destructive' });
      }
    },
    [message, openCompose, settings.data?.composeWindowMode, t],
  );

  return { launch };
}
