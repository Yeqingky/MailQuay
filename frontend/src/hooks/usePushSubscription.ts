import { useEffect } from 'react';
import { ensurePushSubscription, removePushSubscription } from '@/lib/push';
import { useUiStore } from '@/stores/ui';

/**
 * Keeps the browser push subscription in sync with the notification toggle and
 * sound preference. Falls back silently when push is unsupported or denied.
 */
export function usePushSubscription(): void {
  const enabled = useUiStore((state) => state.desktopNotifications);
  const sound = useUiStore((state) => state.notificationSound);
  const setPushActive = useUiStore((state) => state.setPushActive);

  useEffect(() => {
    if (enabled) return;
    setPushActive(false);
    void removePushSubscription();
  }, [enabled, setPushActive]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      setPushActive(false);
      return;
    }
    let cancelled = false;
    void ensurePushSubscription(sound).then((active) => {
      if (!cancelled) setPushActive(active);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, sound, setPushActive]);
}
