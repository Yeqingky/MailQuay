import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/common/States';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  fetchSettings,
  settingsKeys,
  updateSettings,
  type SettingsUpdate,
} from '@/features/settings/api';
import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/SettingsSection';

interface OAuthFormState {
  googleClientId: string;
  microsoftClientId: string;
  googleClientSecret: string;
  microsoftClientSecret: string;
}

export function OAuthSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const query = useQuery({ queryKey: settingsKeys.detail, queryFn: fetchSettings });
  const [form, setForm] = useState<OAuthFormState>({
    googleClientId: '',
    microsoftClientId: '',
    googleClientSecret: '',
    microsoftClientSecret: '',
  });

  useEffect(() => {
    if (!query.data) return;
    const settings = query.data;
    setForm({
      googleClientId: settings.googleClientId,
      microsoftClientId: settings.microsoftClientId,
      googleClientSecret: '',
      microsoftClientSecret: '',
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: (body: SettingsUpdate) => updateSettings(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.detail, updated);
      setForm((previous) => ({
        ...previous,
        googleClientSecret: '',
        microsoftClientSecret: '',
      }));
      toast(t('settings.oauth.saved'));
    },
    onError: (saveError) =>
      toast(t('common.saveFailed'), {
        description: message(saveError),
        variant: 'destructive',
      }),
  });

  const update = <K extends keyof OAuthFormState>(key: K, value: OAuthFormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const settings = query.data;

  const submit = () => {
    const body: SettingsUpdate = {
      googleClientId: form.googleClientId.trim(),
      microsoftClientId: form.microsoftClientId.trim(),
    };
    if (form.googleClientSecret.trim() !== '') {
      body.googleClientSecret = form.googleClientSecret.trim();
    }
    if (form.microsoftClientSecret.trim() !== '') {
      body.microsoftClientSecret = form.microsoftClientSecret.trim();
    }
    save.mutate(body);
  };

  return (
    <div>
      <SettingsSection
        title={t('settings.oauth.providers')}
        description={t('settings.oauth.providersHint')}
      >
        <SettingsRow
          title={t('settings.oauth.googleClientId')}
          htmlFor="oauth-google-client-id"
          control={
            <Input
              id="oauth-google-client-id"
              value={form.googleClientId}
              onChange={(event) => update('googleClientId', event.target.value)}
              className="w-80"
              spellCheck={false}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.oauth.googleClientSecret')}
          description={t('settings.oauth.secretWriteOnly')}
          htmlFor="oauth-google-client-secret"
          control={
            <div className="flex items-center gap-2">
              <Badge variant={settings.googleSecretSet ? 'secondary' : 'muted'}>
                {settings.googleSecretSet
                  ? t('settings.oauth.secretSet')
                  : t('settings.oauth.secretNotSet')}
              </Badge>
              <Input
                id="oauth-google-client-secret"
                type="password"
                value={form.googleClientSecret}
                onChange={(event) => update('googleClientSecret', event.target.value)}
                placeholder={t('settings.oauth.secretPlaceholder')}
                className="w-64"
                autoComplete="new-password"
              />
            </div>
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.oauth.microsoftClientId')}
          htmlFor="oauth-microsoft-client-id"
          control={
            <Input
              id="oauth-microsoft-client-id"
              value={form.microsoftClientId}
              onChange={(event) => update('microsoftClientId', event.target.value)}
              className="w-80"
              spellCheck={false}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          title={t('settings.oauth.microsoftClientSecret')}
          description={t('settings.oauth.secretWriteOnly')}
          htmlFor="oauth-microsoft-client-secret"
          control={
            <div className="flex items-center gap-2">
              <Badge variant={settings.microsoftSecretSet ? 'secondary' : 'muted'}>
                {settings.microsoftSecretSet
                  ? t('settings.oauth.secretSet')
                  : t('settings.oauth.secretNotSet')}
              </Badge>
              <Input
                id="oauth-microsoft-client-secret"
                type="password"
                value={form.microsoftClientSecret}
                onChange={(event) => update('microsoftClientSecret', event.target.value)}
                placeholder={t('settings.oauth.secretPlaceholder')}
                className="w-64"
                autoComplete="new-password"
              />
            </div>
          }
        />
      </SettingsSection>

      <SettingsDivider />
      <div className="flex items-center gap-3 pt-4">
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('settings.oauth.save')}
        </Button>
      </div>
    </div>
  );
}
