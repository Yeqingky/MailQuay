import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { SettingsLayout } from '@/app/SettingsLayout';
import { isSettingsGroup, type SettingsGroup } from '@/components/layout/SettingsSidebar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PreferencesSettingsPage } from './settings/PreferencesPage';
import { AccountSettingsPage } from './settings/AccountPage';
import { MailAccountsSettingsPage } from './settings/AccountsPage';
import { MailSettingsPage } from './settings/MailSettingsPage';
import { PerformanceSettingsPage } from './settings/PerformancePage';
import { OAuthSettingsPage } from './settings/OAuthPage';
import { ServerSettingsPage } from './settings/ServerPage';
import { AboutSettingsPage } from './settings/AboutPage';

const META: Record<SettingsGroup, { titleKey: string; descriptionKey: string }> = {
  preferences: {
    titleKey: 'settings.preferences.title',
    descriptionKey: 'settings.preferences.description',
  },
  account: { titleKey: 'settings.account.title', descriptionKey: 'settings.account.description' },
  accounts: { titleKey: 'account.title', descriptionKey: 'account.description' },
  mail: { titleKey: 'settings.mail.title', descriptionKey: 'settings.mail.description' },
  performance: {
    titleKey: 'settings.performance.title',
    descriptionKey: 'settings.performance.description',
  },
  server: {
    titleKey: 'settings.server.title',
    descriptionKey: 'settings.server.description',
  },
  oauth: {
    titleKey: 'settings.oauth.title',
    descriptionKey: 'settings.oauth.description',
  },
  about: { titleKey: 'settings.about.title', descriptionKey: 'settings.about.description' },
};

export function SettingsPage() {
  const { t } = useTranslation();
  const { group: rawGroup } = useParams();
  const group = isSettingsGroup(rawGroup) ? rawGroup : null;
  const meta = group ? META[group] : null;
  useDocumentTitle(t('settings.title'));

  if (!group || !meta) {
    return <Navigate to="/settings/account" replace />;
  }

  const content = (() => {
    switch (group) {
      case 'preferences':
        return <PreferencesSettingsPage />;
      case 'account':
        return <AccountSettingsPage />;
      case 'accounts':
        return <MailAccountsSettingsPage />;
      case 'mail':
        return <MailSettingsPage />;
      case 'performance':
        return <PerformanceSettingsPage />;
      case 'server':
        return <ServerSettingsPage />;
      case 'oauth':
        return <OAuthSettingsPage />;
      case 'about':
        return <AboutSettingsPage />;
      default:
        return null;
    }
  })();

  return (
    <SettingsLayout group={group} title={t(meta.titleKey)} description={t(meta.descriptionKey)}>
      {content}
    </SettingsLayout>
  );
}
