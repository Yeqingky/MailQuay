import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';
import { useAuthStatus } from '@/hooks/useAuth';
import { applyLanguage } from '@/lib/i18n';
import { applyThemeClass, useUiStore } from '@/stores/ui';
import { ErrorState, LoadingState } from '@/components/common/States';
import type { ThemePreference } from '@/stores/ui';

function isThemePreference(value: string): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function AuthGate() {
  const { t } = useTranslation();
  const query = useAuthStatus();
  const setTheme = useUiStore((state) => state.setTheme);
  const user = query.data?.user;

  useEffect(() => {
    if (user?.locale) applyLanguage(user.locale);
    if (user?.theme && isThemePreference(user.theme)) {
      setTheme(user.theme);
      applyThemeClass(user.theme);
    }
  }, [setTheme, user?.locale, user?.theme]);

  if (query.isPending) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label={t('app.loading')} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  if (query.data?.needsSetup === true) {
    return <Navigate to="/setup" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
