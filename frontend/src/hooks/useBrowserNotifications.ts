import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { readEventMessage } from '@/features/message-list/eventPayload';
import type { MessageSummary } from '@/features/message-list/api';
import { subscribeMailEvent, type MessageEventPayload } from '@/lib/events/bus';
import { useUiStore } from '@/stores/ui';

const COALESCE_MS = 1_000;
const SEEN_LIMIT = 200;
const NOTIFICATION_TAG = 'mailquay-new-mail';

/**
 * Shows a browser notification for new unread mail while the page is hidden.
 * Messages that arrive together are coalesced into one notification, and the
 * click handler opens the mailbox containing the latest message.
 */
export function useBrowserNotifications(): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const enabled = useUiStore((state) => state.desktopNotifications);
  const pending = useRef<MessageSummary[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    timer.current = undefined;
    if (!enabled) {
      pending.current = [];
      return;
    }
    if (document.visibilityState === 'visible') {
      pending.current = [];
      return;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      pending.current = [];
      return;
    }

    const messages = pending.current;
    pending.current = [];
    const latest = messages.at(-1);
    if (!latest) return;

    const sender = latest.from?.name || latest.from?.email || t('common.unknown');
    const title =
      messages.length === 1
        ? sender
        : t('notifications.newMessages', { count: messages.length });
    const body = latest.subject || t('mail.noSubject');

    try {
      const notification = new Notification(title, {
        body,
        tag: NOTIFICATION_TAG,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        navigate(
          `/accounts/${encodeURIComponent(latest.accountId)}/mailboxes/${encodeURIComponent(latest.mailboxId)}`,
        );
      };
    } catch {
      // Some mobile browsers expose Notification but reject the constructor.
    }
  }, [enabled, navigate, t]);

  useEffect(() => {
    if (!enabled) {
      pending.current = [];
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
      }
      return;
    }

    const unsubscribe = subscribeMailEvent<MessageEventPayload>('message.new', (payload) => {
      const message = readEventMessage(payload.message);
      if (!message || !message.unread) return;
      if (seen.current.has(message.id)) return;
      seen.current.add(message.id);
      if (seen.current.size > SEEN_LIMIT) {
        const oldest = seen.current.values().next().value;
        if (oldest) seen.current.delete(oldest);
      }
      pending.current.push(message);
      if (timer.current === undefined) {
        timer.current = window.setTimeout(flush, COALESCE_MS);
      }
    });

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      pending.current = [];
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
      }
    };
  }, [enabled, flush]);
}
