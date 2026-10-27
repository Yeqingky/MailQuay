import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Info,
  KeyRound,
  Mail,
  Network,
  Palette,
  Server,
  Settings,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type SettingsGroup =
  | 'preferences'
  | 'account'
  | 'accounts'
  | 'mail'
  | 'performance'
  | 'server'
  | 'oauth'
  | 'about';

const SETTINGS_GROUPS: Record<SettingsGroup, true> = {
  preferences: true,
  account: true,
  accounts: true,
  mail: true,
  performance: true,
  server: true,
  oauth: true,
  about: true,
};

export function isSettingsGroup(value: string | undefined): value is SettingsGroup {
  return value !== undefined && value in SETTINGS_GROUPS;
}

interface NavItem {
  group: SettingsGroup;
  href: string;
  labelKey: string;
  descriptionKey: string;
  icon: typeof Settings;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const SETTINGS_NAV: NavGroup[] = [
  {
    labelKey: 'settings.groups.account',
    items: [
      {
        group: 'account',
        href: '/settings/account',
        labelKey: 'settings.nav.account',
        descriptionKey: 'settings.items.account',
        icon: UserRound,
      },
      {
        group: 'accounts',
        href: '/settings/accounts',
        labelKey: 'settings.nav.accounts',
        descriptionKey: 'settings.items.accounts',
        icon: Server,
      },
      {
        group: 'preferences',
        href: '/settings/preferences',
        labelKey: 'settings.nav.preferences',
        descriptionKey: 'settings.items.preferences',
        icon: Palette,
      },
    ],
  },
  {
    labelKey: 'settings.groups.mail',
    items: [
      {
        group: 'mail',
        href: '/settings/mail',
        labelKey: 'settings.nav.mail',
        descriptionKey: 'settings.items.mail',
        icon: Mail,
      },
      {
        group: 'performance',
        href: '/settings/performance',
        labelKey: 'settings.nav.performance',
        descriptionKey: 'settings.items.performance',
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    labelKey: 'settings.groups.server',
    items: [
      {
        group: 'server',
        href: '/settings/server',
        labelKey: 'settings.nav.server',
        descriptionKey: 'settings.items.server',
        icon: Network,
      },
      {
        group: 'oauth',
        href: '/settings/oauth',
        labelKey: 'settings.nav.oauth',
        descriptionKey: 'settings.items.oauth',
        icon: KeyRound,
      },
    ],
  },
  {
    labelKey: 'settings.groups.about',
    items: [
      {
        group: 'about',
        href: '/settings/about',
        labelKey: 'settings.nav.about',
        descriptionKey: 'settings.items.about',
        icon: Info,
      },
    ],
  },
];

export function SettingsSidebar({
  current,
  onNavigate,
}: {
  current: SettingsGroup;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const query = filter.trim().toLowerCase();

  // Entering settings always lands with the search box focused so the user can
  // start typing to jump to a group; later group switches keep the focus.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const groups = SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!query) return true;
      const label = t(item.labelKey).toLowerCase();
      const description = t(item.descriptionKey).toLowerCase();
      return label.includes(query) || description.includes(query) || item.group.includes(query);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="px-2.5 py-2">
        <Input
          ref={searchRef}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.search')}
          className="h-7 text-xs"
        />
      </div>

      <ScrollArea as="nav" aria-label={t('settings.title')} containerClassName="min-h-0 flex-1" className="px-2 pb-2">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {t('settings.noResults', { query: filter })}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.labelKey} className="mb-2">
              <p className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(group.labelKey)}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = current === item.group;
                  return (
                    <Link
                      key={item.group}
                      to={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-7 items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                        active && 'bg-accent font-medium text-accent-foreground',
                      )}
                    >
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
