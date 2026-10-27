import { useQuery } from '@tanstack/react-query';
import { fetchSettings, settingsKeys } from '@/features/settings/api';

export interface MailListPreferences {
  removeReadImmediately: boolean;
  prependNewMessages: boolean;
}

/**
 * List behaviour lives in the shared settings record so every device agrees.
 * Defaults match the backend while the first read is in flight.
 */
export function useMailListPreferences(): MailListPreferences {
  const query = useQuery({
    queryKey: settingsKeys.detail,
    queryFn: fetchSettings,
    staleTime: 60_000,
  });
  return {
    removeReadImmediately: query.data?.removeReadImmediately ?? false,
    prependNewMessages: query.data?.prependNewMessages ?? true,
  };
}
