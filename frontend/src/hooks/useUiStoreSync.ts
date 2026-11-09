import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui';

/** Rehydrates the persisted UI store when another tab changes it. */
export function useUiStoreSync(): void {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'mailquay:ui') return;
      void useUiStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
