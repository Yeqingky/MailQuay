import { useEffect, useState } from 'react';
import { resolveTheme, useUiStore } from '@/stores/ui';

// useResolvedTheme tracks the effective light/dark theme, including live
// changes to the system preference when the stored preference is "system".
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useUiStore((state) => state.theme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => resolveTheme('system'));

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);

  return theme === 'system' ? systemTheme : theme;
}
