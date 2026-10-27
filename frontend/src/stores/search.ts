import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SearchMode = 'all' | 'subject';
export type AttachmentFilter = 'any' | 'with' | 'without';

export interface SearchFilters {
  q: string;
  mode: SearchMode;
  accountId: string;
  mailboxId: string;
  recipient: string;
  sender: string;
  hasAttachment: AttachmentFilter;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  q: '',
  mode: 'all',
  accountId: '',
  mailboxId: '',
  recipient: '',
  sender: '',
  hasAttachment: 'any',
};

interface SearchState {
  filters: SearchFilters;
  applied: SearchFilters;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  apply: () => void;
  reset: () => void;
  setQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      filters: { ...EMPTY_SEARCH_FILTERS },
      applied: { ...EMPTY_SEARCH_FILTERS },
      setFilter: (key, value) =>
        set((state) => ({
          filters: {
            ...state.filters,
            [key]: value,
            ...(key === 'accountId' ? { mailboxId: '' } : {}),
          },
        })),
      apply: () => set((state) => ({ applied: { ...state.filters } })),
      reset: () =>
        set({ filters: { ...EMPTY_SEARCH_FILTERS }, applied: { ...EMPTY_SEARCH_FILTERS } }),
      setQuery: (query) =>
        set((state) => ({
          filters: { ...state.filters, q: query },
          applied: { ...state.applied, q: query },
        })),
    }),
    {
      name: 'mailquay:search',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ filters: state.filters, applied: state.applied }),
    },
  ),
);
