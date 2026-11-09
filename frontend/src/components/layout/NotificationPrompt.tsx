import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications';
import { useUiStore } from '@/stores/ui';

export function NotificationPrompt() {
  const { t } = useTranslation();
  const requested = useUiStore((state) => state.notificationPromptRequested);
  const dismiss = useUiStore((state) => state.dismissNotificationPrompt);
  const { supported, enabled, permission, request } = useDesktopNotifications();

  if (!requested || !supported || (enabled && permission === 'granted') || permission === 'denied') {
    return null;
  }

  const enable = async () => {
    await request();
    dismiss();
  };

  return (
    <div
      role="region"
      aria-label={t('notifications.prompt')}
      aria-live="polite"
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-[70] w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <p className="text-[13px] font-medium leading-5">{t('notifications.prompt')}</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
          {t('common.close')}
        </Button>
        <Button type="button" size="sm" onClick={() => void enable()}>
          {t('notifications.enable')}
        </Button>
      </div>
    </div>
  );
}
