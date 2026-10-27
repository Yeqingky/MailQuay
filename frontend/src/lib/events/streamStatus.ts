import { useSyncExternalStore } from 'react';

/**
 * Connection state of the single document-wide SSE stream. Kept outside the
 * React tree so the sidebar can render it without the stream hook owning
 * component state.
 */
export type StreamStatus = 'connecting' | 'connected' | 'retrying' | 'failed';

let status: StreamStatus = 'connecting';
const listeners = new Set<() => void>();

export function getStreamStatus(): StreamStatus {
  return status;
}

export function setStreamStatus(next: StreamStatus): void {
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener();
}

export function subscribeStreamStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStreamStatus(): StreamStatus {
  return useSyncExternalStore(subscribeStreamStatus, getStreamStatus, getStreamStatus);
}
