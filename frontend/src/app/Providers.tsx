import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import i18n from '@/lib/i18n';
import { applyThemeClass, useUiStore } from '@/stores/ui';
import { ErrorBoundary } from './ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number(error.status)
            : 0;
        if (status === 401 || status === 403 || status === 404 || status === 409) return false;
        return failureCount < 2;
      },
    },
  },
});

function ThemeBridge() {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    applyThemeClass(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyThemeClass('system');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider delayDuration={250}>
          <ThemeBridge />
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

export { queryClient };
