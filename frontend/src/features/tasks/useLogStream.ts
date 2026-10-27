import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api/client';
import type { LogEntry } from './api';

const MAX_FAILURES = 3;

export type LogStreamStatus = 'connecting' | 'connected' | 'retrying' | 'failed';

/**
 * One frame from the log stream. A reset frame means the server dropped the
 * records the client had, so the local list must be replaced before the
 * following frame is applied.
 */
export interface LogStreamBatch {
  reset: boolean;
  entries: LogEntry[];
  cursor: string;
}

interface Options {
  enabled: boolean;
  cursor: string | undefined;
  onBatch: (batch: LogStreamBatch) => void;
}

function parseEntries(data: string): LogEntry[] {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LogEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as LogEntry).id === 'number' &&
        typeof (entry as LogEntry).line === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Tails runtime log records over SSE while the caller needs them. Like the
 * document event stream there is no polling fallback: after three consecutive
 * failures the stream reports `failed` and stays closed until `retry` runs.
 */
export function useLogStream({ enabled, cursor, onBatch }: Options): {
  status: LogStreamStatus;
  retry: () => void;
} {
  const [status, setStatus] = useState<LogStreamStatus>('connecting');
  const [attempt, setAttempt] = useState(0);
  const batchRef = useRef(onBatch);
  // The cursor prop only seeds the first connection; every received frame
  // advances the cursor. Keeping it out of the effect dependencies is what
  // stops a new connection from opening for each batch.
  const startCursorRef = useRef(cursor);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    startCursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    batchRef.current = onBatch;
  }, [onBatch]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    if (!lastEventIdRef.current) lastEventIdRef.current = startCursorRef.current ?? null;
    if (!lastEventIdRef.current) return;
    let source: EventSource | null = null;
    let disposed = false;
    let failures = 0;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      const cursor = lastEventIdRef.current;
      if (!cursor) return;
      setStatus(failures === 0 ? 'connecting' : 'retrying');
      const url = apiUrl(`/logs/stream?after=${encodeURIComponent(cursor)}`);
      source = new EventSource(url, { withCredentials: true });
      source.onopen = () => {
        failures = 0;
        setStatus('connected');
      };
      source.onmessage = (event) => {
        if (event.lastEventId) lastEventIdRef.current = event.lastEventId;
        const entries = parseEntries(event.data);
        if (entries.length === 0) return;
        batchRef.current({ reset: false, entries, cursor: lastEventIdRef.current ?? cursor });
      };
      source.addEventListener('reset', (event) => {
        const frame = event as MessageEvent<string>;
        if (frame.lastEventId) lastEventIdRef.current = frame.lastEventId;
        batchRef.current({ reset: true, entries: [], cursor: lastEventIdRef.current ?? cursor });
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (disposed) return;
        failures += 1;
        if (failures >= MAX_FAILURES) {
          setStatus('failed');
          return;
        }
        setStatus('retrying');
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { status, retry };
}
