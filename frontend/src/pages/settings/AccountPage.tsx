import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useAuthStatus } from '@/hooks/useAuth';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { authKeys, changePassword, updateProfile, type User } from '@/features/auth/api';
import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/SettingsSection';
import { applyLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import { applyThemeClass, useUiStore, type ThemePreference } from '@/stores/ui';

function themeValue(value: string | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function AccountSettingsPage() {
  const { t } = useTranslation();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const setTheme = useUiStore((state) => state.setTheme);
  const user: User | undefined = auth.data?.user;

  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [theme, setThemeValue] = useState<ThemePreference>('system');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setLanguage(user.locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
    setThemeValue(themeValue(user.theme));
  }, [user]);

  const saveProfile = useMutation({
    mutationFn: () =>
      updateProfile({
        displayName: displayName.trim(),
        locale: language,
        theme,
      }),
    onSuccess: (updated) => {
      const updatedTheme = themeValue(updated.theme);
      setTheme(updatedTheme);
      applyThemeClass(updatedTheme);
      applyLanguage(updated.locale);
      toast(t('settings.account.savedProfile'));
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
    onError: (error) =>
      toast(t('common.saveFailed'), {
        description: message(error),
        variant: 'destructive',
      }),
  });

  const change = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast(t('settings.account.passwordChanged'));
    },
    onError: (error) =>
      toast(t('common.saveFailed'), {
        description: message(error),
        variant: 'destructive',
      }),
  });

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast(t('common.saveFailed'), {
        description: t('settings.account.passwordMismatch'),
        variant: 'destructive',
      });
      return;
    }
    if (newPassword.length < 8) {
      toast(t('common.saveFailed'), {
        description: t('settings.account.passwordTooShort'),
        variant: 'destructive',
      });
      return;
    }
    change.mutate();
  };

  return (
    <div>
      <SettingsSection title={t('settings.account.profile')}>
        <SettingsRow
          title={t('settings.account.displayName')}
          htmlFor="profile-display-name"
          control={
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
              className="w-64"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.account.locale')}
          htmlFor="profile-locale"
          control={
            <Select
              value={language}
              onValueChange={(value) => {
                setLanguage(value as SupportedLanguage);
              }}
            >
              <SelectTrigger id="profile-locale" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`settings.languageNames.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.account.theme')}
          htmlFor="profile-theme"
          control={
            <Select
              value={theme}
              onValueChange={(value) => {
                setThemeValue(themeValue(value));
              }}
            >
              <SelectTrigger id="profile-theme" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('settings.account.themeOptions.light')}</SelectItem>
                <SelectItem value="dark">{t('settings.account.themeOptions.dark')}</SelectItem>
                <SelectItem value="system">{t('settings.account.themeOptions.system')}</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <div className="flex items-center gap-3 pb-4">
        <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !user}>
          {saveProfile.isPending ? t('common.saving') : t('settings.account.saveProfile')}
        </Button>
      </div>

      <SettingsDivider />

      <SettingsSection
        title={t('settings.account.password')}
        description={t('settings.account.passwordDescription')}
      >
        <form onSubmit={submitPassword} className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="current-password" className="w-40 text-[13px]">
              {t('settings.account.currentPassword')}
            </label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="w-64"
              required
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="new-password" className="w-40 text-[13px]">
              {t('settings.account.newPassword')}
            </label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="w-64"
              minLength={8}
              required
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="confirm-password" className="w-40 text-[13px]">
              {t('settings.account.confirmPassword')}
            </label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="w-64"
              minLength={8}
              required
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="size-4" aria-hidden="true" />
              )}
              {t('settings.account.changePassword')}
            </Button>
          </div>
        </form>
      </SettingsSection>
    </div>
  );
}
