import { useCallback, useEffect, useRef } from 'react';
import type { Draft, DraftInput } from './draft-api';
import { createDraft, updateDraft } from './draft-api';

export interface DraftSaverOptions {
  enabled: boolean;
  draftId: string | undefined;
  revision: number;
  getPayload: () => DraftInput | null;
  onSaved: (draft: Draft) => void;
  onError: (error: unknown) => void;
  onSavingChange: (saving: boolean) => void;
}

export interface DraftSaver {
  schedule: () => void;
  flush: () => Promise<Draft | undefined>;
  cancel: () => void;
  markClean: () => void;
  prime: (draft: Draft) => void;
}

const DEBOUNCE_MS = 2000;
const MAX_WAIT_MS = 10_000;

/**
 * Two timers implement the draft save policy: save 2s after typing stops,
 * or at most 10s after the first unsaved change.
 */
export function useDraftSaver({
  enabled,
  draftId,
  revision,
  getPayload,
  onSaved,
  onError,
  onSavingChange,
}: DraftSaverOptions): DraftSaver {
  const draftIdRef = useRef(draftId);
  const revisionRef = useRef(revision);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const maxRef = useRef<number | undefined>(undefined);
  const payloadRef = useRef(getPayload);
  const callbacksRef = useRef({ onSaved, onError, onSavingChange });
  const inFlightRef = useRef<Promise<Draft | undefined> | null>(null);
  const enabledRef = useRef(enabled);
  const latestDraftRef = useRef<Draft | undefined>(undefined);
  const lastFailedRef = useRef(false);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);
  useEffect(() => {
    payloadRef.current = getPayload;
    callbacksRef.current = { onSaved, onError, onSavingChange };
    enabledRef.current = enabled;
  });

  const clearTimers = useCallback(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    if (maxRef.current !== undefined) window.clearTimeout(maxRef.current);
    debounceRef.current = undefined;
    maxRef.current = undefined;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const runSave = useCallback(async (): Promise<Draft | undefined> => {
    if (!enabledRef.current || !dirtyRef.current || savingRef.current) {
      return latestDraftRef.current;
    }
    const payload = payloadRef.current();
    if (!payload) return latestDraftRef.current;
    clearTimers();
    savingRef.current = true;
    callbacksRef.current.onSavingChange(true);
    try {
      let saved: Draft;
      if (draftIdRef.current) {
        saved = await updateDraft(draftIdRef.current, {
          ...payload,
          revision: revisionRef.current,
        });
      } else {
        saved = await createDraft(payload);
        draftIdRef.current = saved.id;
      }
      latestDraftRef.current = saved;
      revisionRef.current = saved.revision;
      dirtyRef.current = false;
      lastFailedRef.current = false;
      callbacksRef.current.onSaved(saved);
      return saved;
    } catch (error) {
      dirtyRef.current = true;
      lastFailedRef.current = true;
      callbacksRef.current.onError(error);
      throw error;
    } finally {
      savingRef.current = false;
      callbacksRef.current.onSavingChange(false);
      if (dirtyRef.current && !lastFailedRef.current) {
        debounceRef.current = window.setTimeout(() => {
          void runSave();
        }, DEBOUNCE_MS);
      }
    }
  }, [clearTimers]);

  const save = useCallback((): Promise<Draft | undefined> => {
    if (inFlightRef.current) return inFlightRef.current;
    const promise = runSave().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, [runSave]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void save();
    }, DEBOUNCE_MS);
    if (maxRef.current === undefined) {
      maxRef.current = window.setTimeout(() => {
        void save();
      }, MAX_WAIT_MS);
    }
  }, [save]);

  const flush = useCallback(async (): Promise<Draft | undefined> => {
    clearTimers();
    if (inFlightRef.current) await inFlightRef.current;
    if (dirtyRef.current) await save();
    if (inFlightRef.current) await inFlightRef.current;
    return latestDraftRef.current;
  }, [clearTimers, save]);

  const cancel = useCallback(() => {
    clearTimers();
    dirtyRef.current = false;
  }, [clearTimers]);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
    lastFailedRef.current = false;
  }, []);

  const prime = useCallback((draft: Draft) => {
    latestDraftRef.current = draft;
    draftIdRef.current = draft.id;
    revisionRef.current = draft.revision;
  }, []);

  return { schedule, flush, cancel, markClean, prime };
}
