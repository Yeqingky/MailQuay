import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { useUiStore } from '@/stores/ui';

export function useDesktopNotifications() {
  const { t } = useTranslation();
  const enabled = useUiStore((state) => state.desktopNotifications);
  const setEnabled = useUiStore((state) => state.setDesktopNotifications);
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? Notification.permission : 'denied',
  );

  const request = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    try {
      const next =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      setPermission(next);
      if (next === 'granted') {
        setEnabled(true);
        return true;
      }
    } catch {
      // Fall through to the error toast.
    }
    toast(t('settings.preferences.notificationsDenied'), { variant: 'destructive' });
    return false;
  }, [setEnabled, supported, t]);

  const disable = useCallback(() => setEnabled(false), [setEnabled]);

  return { supported, enabled, permission, request, disable };
}
