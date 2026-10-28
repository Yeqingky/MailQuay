import { create } from 'zustand';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
  pause: () => void;
  resume: () => void;
}

const DURATIONS: Record<ToastVariant, number | null> = {
  success: 3500,
  default: 5000,
  destructive: null,
};

const MAX_TOASTS = 3;

let counter = 0;
let pauseCount = 0;
const timers = new Map<string, number>();
const remaining = new Map<string, number>();
const deadlines = new Map<string, number>();

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
  deadlines.delete(id);
}

function schedule(id: string, ms: number) {
  clearTimer(id);
  remaining.set(id, ms);
  deadlines.set(id, Date.now() + ms);
  timers.set(
    id,
    window.setTimeout(() => {
      timers.delete(id);
      remaining.delete(id);
      deadlines.delete(id);
      useToastStore.getState().dismiss(id);
    }, ms),
  );
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    counter += 1;
    const id = `toast-${counter}`;
    const variant = toast.variant ?? 'default';
    const current = get().toasts;
    const dropped = current.slice(0, Math.max(0, current.length - (MAX_TOASTS - 1)));
    for (const item of dropped) {
      clearTimer(item.id);
      remaining.delete(item.id);
    }
    set({
      toasts: [...current.slice(-(MAX_TOASTS - 1)), { ...toast, id, variant }],
    });
    const duration = DURATIONS[variant];
    if (duration !== null) {
      if (pauseCount > 0) remaining.set(id, duration);
      else schedule(id, duration);
    }
    return id;
  },
  dismiss: (id) => {
    const exists = get().toasts.some((entry) => entry.id === id);
    if (!exists) return;
    clearTimer(id);
    remaining.delete(id);
    set({ toasts: get().toasts.filter((entry) => entry.id !== id) });
  },
  pause: () => {
    pauseCount += 1;
    if (pauseCount > 1) return;
    const now = Date.now();
    for (const [id, timer] of timers) {
      window.clearTimeout(timer);
      const deadline = deadlines.get(id);
      remaining.set(id, deadline === undefined ? 0 : Math.max(0, deadline - now));
      deadlines.delete(id);
    }
    timers.clear();
  },
  resume: () => {
    if (pauseCount === 0) return;
    pauseCount -= 1;
    if (pauseCount > 0) return;
    for (const item of get().toasts) {
      if (DURATIONS[item.variant] === null) continue;
      const left = remaining.get(item.id);
      if (left !== undefined) schedule(item.id, left);
    }
  },
}));

export function toast(title: string, options: { description?: string; variant?: ToastVariant } = {}) {
  return useToastStore.getState().push({
    title,
    description: options.description,
    variant: options.variant ?? 'default',
  });
}
