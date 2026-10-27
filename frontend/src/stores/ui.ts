import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clamp } from '@/lib/format';
import {
  LIST_MAX_WIDTH,
  LIST_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '@/lib/paneLayout';

export type ThemePreference = 'light' | 'dark' | 'system';
export type MobilePane = 'list' | 'reader';

const DEFAULT_SIDEBAR_WIDTH = 232;

interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  mobilePane: MobilePane;
  setMobilePane: (pane: MobilePane) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  listWidth: number;
  setListWidth: (width: number) => void;
  expandedAccounts: Record<string, boolean>;
  toggleAccount: (accountId: string) => void;
  expandedOther: Record<string, boolean>;
  toggleOther: (accountId: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      mobilePane: 'list',
      setMobilePane: (mobilePane) => set({ mobilePane }),
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      setSidebarWidth: (width) =>
        set({ sidebarWidth: clamp(Math.round(width), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH) }),
      listWidth: 0,
      setListWidth: (width) =>
        set({ listWidth: clamp(Math.round(width), LIST_MIN_WIDTH, LIST_MAX_WIDTH) }),
      expandedAccounts: {},
      toggleAccount: (accountId) =>
        set((state) => ({
          expandedAccounts: {
            ...state.expandedAccounts,
            [accountId]: !state.expandedAccounts[accountId],
          },
        })),
      expandedOther: {},
      toggleOther: (accountId) =>
        set((state) => ({
          expandedOther: {
            ...state.expandedOther,
            [accountId]: !state.expandedOther[accountId],
          },
        })),
    }),
    {
      name: 'mailquay:ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarWidth: state.sidebarWidth,
        listWidth: state.listWidth,
        expandedAccounts: state.expandedAccounts,
        expandedOther: state.expandedOther,
      }),
    },
  ),
);

export function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeClass(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}
