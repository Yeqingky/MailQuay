import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api/client';
import { parseEventPayload, publishMailEvent } from './bus';
import { setStreamStatus } from './streamStatus';

const EVENT_NAMES = [
  'hello',
  'message.new',
  'message.updated',
  'message.removed',
  'mailbox.updated',
  'account.updated',
  'outbox.updated',
  'task.updated',
  'task.removed',
] as const;

type EventName = (typeof EVENT_NAMES)[number];

// Browsers all support EventSource, so there is no polling fallback. Instead
// stop reconnecting after three consecutive failures; the sidebar then shows
// the stream as failed until the page is reloaded.
const MAX_FAILURES = 3;

// Events arrive in bursts (a bulk sync can publish once per second for minutes),
// so every invalidation is coalesced into one refresh per window instead of one
// request per event.
const MAILBOX_REFRESH_MS = 1_000;
const MESSAGE_REFRESH_MS = 1_000;
const TASK_REFRESH_MS = 1_500;

type InvalidationKey = readonly string[];

interface InvalidationContext {
  invalidate: (key: InvalidationKey, delayMs: number) => void;
}

const INVALIDATION_BY_EVENT: Record<EventName, (ctx: InvalidationContext) => void> = {
  hello: () => undefined,
  // The active list inserts the message from the summary payload; only the
  // counters need a global refresh.
  'message.new': (ctx) => ctx.invalidate(['mailboxes'], MAILBOX_REFRESH_MS),
  'message.updated': (ctx) => {
    ctx.invalidate(['messages'], MESSAGE_REFRESH_MS);
    ctx.invalidate(['mailboxes'], MAILBOX_REFRESH_MS);
  },
  'message.removed': (ctx) => {
    ctx.invalidate(['messages'], MESSAGE_REFRESH_MS);
    ctx.invalidate(['mailboxes'], MAILBOX_REFRESH_MS);
  },
  'mailbox.updated': (ctx) => ctx.invalidate(['mailboxes'], MAILBOX_REFRESH_MS),
  'account.updated': (ctx) => {
    ctx.invalidate(['accounts'], 0);
    ctx.invalidate(['mailboxes'], MAILBOX_REFRESH_MS);
  },
  'outbox.updated': (ctx) => {
    ctx.invalidate(['outbox'], 0);
    ctx.invalidate(['drafts'], 0);
    ctx.invalidate(['messages'], MESSAGE_REFRESH_MS);
  },
  'task.updated': (ctx) => ctx.invalidate(['tasks'], TASK_REFRESH_MS),
  'task.removed': (ctx) => ctx.invalidate(['tasks'], TASK_REFRESH_MS),
};

/**
 * One SSE connection per document. Events invalidate server-state caches;
 * they never copy message payloads into client state. Message and mailbox
 * events are also forwarded to mounted views through the in-document bus.
 */
export function useEventStream(enabled = true): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let disposed = false;
    let attempts = 0;
    let lastEventId = '';
    let reconnectTimer: number | undefined;
    const timers = new Map<string, number>();

    const invalidate = (key: InvalidationKey, delayMs: number) => {
      const id = key.join('|');
      if (timers.has(id)) return;
      const fire = () => {
        timers.delete(id);
        if (disposed) return;
        void queryClient.invalidateQueries({ queryKey: key });
      };
      if (delayMs <= 0) {
        fire();
        return;
      }
      timers.set(id, window.setTimeout(fire, delayMs));
    };

    const handle = (event: MessageEvent) => {
      if (event.lastEventId) lastEventId = event.lastEventId;
      const apply = INVALIDATION_BY_EVENT[event.type as EventName];
      if (!apply) return;
      if (event.type.startsWith('message.') || event.type === 'mailbox.updated') {
        publishMailEvent(event.type, parseEventPayload(event.data));
      }
      apply({ invalidate });
    };

    const connect = () => {
      if (disposed) return;
      setStreamStatus(attempts === 0 ? 'connecting' : 'retrying');
      const url = apiUrl(
        lastEventId === '' ? '/events' : `/events?lastEventId=${encodeURIComponent(lastEventId)}`,
      );
      source = new EventSource(url, { withCredentials: true });
      source.onopen = () => {
        const reconnected = attempts > 0;
        attempts = 0;
        setStreamStatus('connected');
        if (!reconnected) return;
        invalidate(['mailboxes'], 0);
        invalidate(['tasks'], 0);
        publishMailEvent('stream.reconnected', { lastEventId });
      };
      for (const name of EVENT_NAMES) {
        source.addEventListener(name, handle as EventListener);
      }
      source.onerror = () => {
        source?.close();
        source = null;
        if (disposed) return;
        attempts += 1;
        if (attempts >= MAX_FAILURES) {
          setStreamStatus('failed');
          return;
        }
        setStreamStatus('retrying');
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    // Returning to the tab recalibrates counts and tasks, and retries a stream
    // that gave up while the page was hidden.
    const onVisibilityChange = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (attempts >= MAX_FAILURES) {
        attempts = 0;
        connect();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    };

    connect();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      if (source) {
        for (const name of EVENT_NAMES) {
          source.removeEventListener(name, handle as EventListener);
        }
        source.close();
      }
    };
  }, [enabled, queryClient]);
}
