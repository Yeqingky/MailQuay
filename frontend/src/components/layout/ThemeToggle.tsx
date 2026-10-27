import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStatus } from '@/hooks/useAuth';
import { updateProfile } from '@/features/auth/api';
import { toast } from '@/components/ui/toast';
import { applyThemeClass, useUiStore } from '@/stores/ui';
import { useErrorMessage } from '@/hooks/useErrorMessage';

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { data } = useAuthStatus();
  const message = useErrorMessage();
  const mutation = useMutation({ mutationFn: updateProfile });

  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  const next = resolved === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    setTheme(next);
    applyThemeClass(next);
    const user = data?.user;
    if (!user) return;
    mutation.mutate(
      { displayName: user.displayName, locale: user.locale, theme: next },
      {
        onError: (error) => toast(t('common.saveFailed'), { description: message(error), variant: 'destructive' }),
      },
    );
  };

  const label = resolved === 'dark' ? t('topbar.themeLight') : t('topbar.themeDark');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={toggle}
          disabled={mutation.isPending}
        >
          {resolved === 'dark' ? (
            <Sun className="size-4" aria-hidden="true" />
          ) : (
            <Moon className="size-4" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
