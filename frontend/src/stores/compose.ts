import { create } from 'zustand';
import type { Schemas } from '@/lib/api/client';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface ComposeSeed {
  draftId?: string;
  mode: ComposeMode;
  message?: Schemas['MessageDetail'];
  messageBodyHtml?: string;
  messageBodyText?: string;
  accountId?: string;
}

interface ComposeState {
  isOpen: boolean;
  seed: ComposeSeed | null;
  openCompose: (seed?: ComposeSeed) => void;
  closeCompose: () => void;
}

export const useComposeStore = create<ComposeState>((set) => ({
  isOpen: false,
  seed: null,
  openCompose: (seed) => set({ isOpen: true, seed: seed ?? { mode: 'new' } }),
  closeCompose: () => set({ isOpen: false, seed: null }),
}));
