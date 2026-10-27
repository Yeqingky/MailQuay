import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStatus } from '@/hooks/useAuth';
import { API_BASE_URL } from '@/lib/api/client';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { useUiStore } from '@/stores/ui';

export function AboutSettingsPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const theme = useUiStore((state) => state.theme);
  const user = auth.data?.user;

  const notes = [
    { title: t('settings.about.archiveBody'), description: t('settings.about.archiveBodyNote') },
    { title: t('settings.about.taskRetry'), description: t('settings.about.taskRetryMissing') },
    { title: t('settings.about.userEmail'), description: t('settings.about.userEmailNote') },
  ];

  return (
    <div>
      <SettingsSection title={t('settings.about.title')}>
        <dl className="divide-y rounded-xl border text-[13px]">
          <Row label={t('settings.about.frontendVersion')} value={__APP_VERSION__} />
          <Row label={t('settings.about.buildMode')} value={import.meta.env.MODE} />
          <Row label={t('settings.about.apiBaseUrl')} value={API_BASE_URL} />
          <Row label={t('settings.about.language')} value={i18n.language} />
          <Row label={t('settings.about.theme')} value={t(`settings.preferences.themeOptions.${theme}`)} />
          <Row
            label={t('settings.about.signedIn')}
            value={user ? `${user.displayName || user.username} (${user.username})` : t('auth.noAccount')}
          />
          <Row
            label={t('settings.about.serverTime')}
            value={
              auth.isSuccess
                ? t('settings.about.reachable')
                : auth.isError
                  ? t('settings.about.unreachable')
                  : t('common.loading')
            }
          />
        </dl>
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['auth'] });
              void auth.refetch();
            }}
            disabled={auth.isFetching}
          >
            <RefreshCw
              className={auth.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'}
              aria-hidden="true"
            />
            {t('settings.about.refresh')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.about.capabilities')}
        description={t('settings.about.description')}
      >
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.title} className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium">{note.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{note.description}</p>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="max-w-full break-all text-xs font-medium">{value}</dd>
    </div>
  );
}
