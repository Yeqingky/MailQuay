/**
 * In-document fan-out for server events. The single SSE connection publishes
 * here; mounted views subscribe without opening their own stream.
 */

export interface MessageEventPayload {
  messageId?: string;
  accountId?: string;
  mailboxId?: string;
  unread?: boolean;
}

type Listener<T> = (payload: T) => void;

const target = typeof window === 'undefined' ? null : new EventTarget();

export function publishMailEvent<T>(name: string, payload: T): void {
  target?.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

export function subscribeMailEvent<T>(name: string, listener: Listener<T>): () => void {
  if (!target) return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<T>).detail);
  target.addEventListener(name, handler);
  return () => target.removeEventListener(name, handler);
}

export function parseEventPayload(raw: string): unknown {
  if (raw === '') return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
