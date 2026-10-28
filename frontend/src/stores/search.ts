import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SearchMode = 'all' | 'subject';
export type AttachmentFilter = 'any' | 'with' | 'without';

export interface SearchFilters {
  q: string;
  mode: SearchMode;
  accountId: string;
  recipient: string;
  sender: string;
  hasAttachment: AttachmentFilter;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  q: '',
  mode: 'all',
  accountId: '',
  recipient: '',
  sender: '',
  hasAttachment: 'any',
};

interface SearchState {
  filters: SearchFilters;
  applied: SearchFilters;
  panelOpen: boolean;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  apply: () => void;
  reset: () => void;
  openPanel: () => void;
  togglePanel: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      filters: { ...EMPTY_SEARCH_FILTERS },
      applied: { ...EMPTY_SEARCH_FILTERS },
      panelOpen: false,
      setFilter: (key, value) =>
        set((state) => ({ filters: { ...state.filters, [key]: value } })),
      apply: () => set((state) => ({ applied: { ...state.filters } })),
      reset: () =>
        set({ filters: { ...EMPTY_SEARCH_FILTERS }, applied: { ...EMPTY_SEARCH_FILTERS } }),
      openPanel: () => set({ panelOpen: true }),
      togglePanel: () =>
        set((state) =>
          state.panelOpen
            ? { panelOpen: false, applied: { ...EMPTY_SEARCH_FILTERS } }
            : { panelOpen: true },
        ),
    }),
    {
      name: 'mailquay:search',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ filters: state.filters, applied: state.applied }),
    },
  ),
);
