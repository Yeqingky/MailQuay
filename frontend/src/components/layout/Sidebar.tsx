import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import {
  Archive,
  ChevronRight,
  FileText,
  ListChecks,
  Inbox,
  Mail,
  MailOpen,
  Star,
  Trash2,
  Send,
  Plus,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchMailboxTree } from '@/features/mailboxes/api';
import { fetchTasks } from '@/features/tasks/api';
import { cn } from '@/lib/utils';
import { normalizePathname } from '@/lib/routes';
import { useStreamStatus, type StreamStatus } from '@/lib/events/streamStatus';
import { useUiStore } from '@/stores/ui';

export type MailView =
  | 'all'
  | 'unread'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'marked'
  | 'archive'
  | 'tasks'
  | 'search'
  | 'folder';

interface FavoriteEntry {
  view: Exclude<MailView, 'search' | 'folder'>;
  href: string;
  label: string;
  icon: typeof Mail;
  count?: number;
}

interface SyncFailure {
  label: string;
  detail: string;
}

export function Sidebar({
  currentView,
  onNavigate,
}: {
  currentView: MailView;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const folderUnreadOnly = new URLSearchParams(location.search).get('view') === 'unread';
  const treeQuery = useQuery({
    queryKey: ['mailboxes', 'tree'],
    queryFn: fetchMailboxTree,
  });
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'list'],
    queryFn: fetchTasks,
    staleTime: 10_000,
  });

  const expandedAccounts = useUiStore((state) => state.expandedAccounts);
  const toggleAccount = useUiStore((state) => state.toggleAccount);
  const expandedOther = useUiStore((state) => state.expandedOther);
  const toggleOther = useUiStore((state) => state.toggleOther);
  // Account expansion is persisted, so animating on first paint would replay
  // the last saved state. Enable the transition on the first user toggle.
  const [animateFolders, setAnimateFolders] = useState(false);
  const toggleAccountAnimated = (accountId: string) => {
    setAnimateFolders(true);
    toggleAccount(accountId);
  };
  const toggleOtherAnimated = (accountId: string) => {
    setAnimateFolders(true);
    toggleOther(accountId);
  };

  const tree = treeQuery.data;
  const counts = tree?.counts;
  const accounts = tree?.accounts ?? [];
  const activeTasks = (tasksQuery.data ?? []).filter(
    (task) => task.status === 'running' || task.status === 'pending',
  ).length;

  const favorites: FavoriteEntry[] = [
    { view: 'all', href: '/', label: t('nav.all'), icon: Mail, count: counts?.all },
    { view: 'unread', href: '/unread', label: t('nav.unread'), icon: MailOpen, count: counts?.unread },
    { view: 'sent', href: '/sent', label: t('nav.sent'), icon: Send, count: counts?.sent },
    { view: 'drafts', href: '/drafts', label: t('nav.drafts'), icon: FileText, count: counts?.drafts },
    { view: 'trash', href: '/trash', label: t('nav.trash'), icon: Trash2, count: counts?.trash },
  ];
  if ((counts?.marked ?? 0) > 0) {
    favorites.push({
      view: 'marked',
      href: '/marked',
      label: t('nav.marked'),
      icon: Star,
      count: counts?.marked,
    });
  }
  favorites.push({
    view: 'archive',
    href: '/archive',
    label: t('nav.archive'),
    icon: Archive,
  });
  favorites.push({
    view: 'tasks',
    href: '/tasks',
    label: t('nav.tasks'),
    icon: ListChecks,
    count: activeTasks,
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <ScrollArea containerClassName="min-h-0 flex-1" className="px-2 pb-2 pt-2">
        <div className="h-10 md:hidden" aria-hidden="true" />
        <nav aria-label={t('nav.navigation')} className="space-y-0.5">
          {favorites.map((entry) => {
            const Icon = entry.icon;
            const active = currentView === entry.view;
            return (
              <Link
                key={entry.view}
                to={entry.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-7 items-center gap-2 rounded-lg px-2.5 text-[13px] text-foreground/90 hover:bg-accent hover:text-accent-foreground',
                  active && 'bg-accent font-medium text-accent-foreground',
                )}
              >
                <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.count !== undefined && entry.count > 0 ? (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {entry.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 flex items-center justify-between px-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('nav.accounts')}
          </span>
          <Link
            to="/settings/accounts"
            aria-label={t('nav.addAccount')}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {treeQuery.isPending ? (
          <div className="mt-2 space-y-1.5 px-2.5">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-5/6" />
            <Skeleton className="h-7 w-4/5" />
          </div>
        ) : treeQuery.isError ? (
          <div className="mt-3 px-2">
            <p className="px-1 text-xs text-muted-foreground">{t('common.loadingFailed')}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start"
              onClick={() => void treeQuery.refetch()}
            >
              <RefreshCw aria-hidden="true" />
              {t('common.retry')}
            </Button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="mt-2 px-2">
            <p className="text-center text-[11px] text-muted-foreground">{t('nav.noAccounts')}</p>
          </div>
        ) : (
          <div className="mt-1.5 space-y-0.5">
            {accounts.map((entry) => {
              const account = entry.account;
              const expanded = expandedAccounts[account.id] ?? false;
              const otherExpanded = expandedOther[account.id] ?? false;
              const unread = entry.folders.reduce((sum, folder) => sum + folder.unread, 0);
              const inbox = entry.folders.find((folder) => folder.role === 'inbox');
              const inboxPath = inbox ? `/accounts/${account.id}/mailboxes/${inbox.id}` : '';
              const inboxActive = inboxPath !== '' && pathname === inboxPath && !folderUnreadOnly;
              const unreadActive = inboxPath !== '' && pathname === inboxPath && folderUnreadOnly;
              const sent = entry.folders.find((folder) => folder.role === 'sent');
              const drafts = entry.folders.find((folder) => folder.role === 'drafts');
              const trash = entry.folders.find((folder) => folder.role === 'trash');
              const junk = [...entry.folders, ...entry.other].find(
                (folder) => folder.role === 'junk',
              );
              const otherFolders = entry.other.filter((folder) => folder.role !== 'junk');
              const folderActive = (id: string) =>
                pathname === `/accounts/${account.id}/mailboxes/${id}` && !folderUnreadOnly;
              const failures: SyncFailure[] = [];
              if (account.state === 'error') {
                failures.push({
                  label: t('nav.sync.accountLevel'),
                  detail: account.lastError || t('nav.sync.unknownError'),
                });
              }
              for (const folder of [...entry.folders, ...entry.other]) {
                if (folder.syncState !== 'error') continue;
                failures.push({
                  label: folder.name,
                  detail: folder.lastError || t('nav.sync.unknownError'),
                });
              }
              return (
                <Collapsible key={account.id} open={expanded}>
                  <div
                    className={cn(
                      'flex min-h-7 items-center rounded-lg pr-1 text-[13px] hover:bg-accent hover:text-accent-foreground',
                      expanded && 'bg-accent/60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleAccountAnimated(account.id)}
                      aria-expanded={expanded}
                      aria-label={
                        expanded
                          ? t('nav.collapseAccount', { email: account.email })
                          : t('nav.expandAccount', { email: account.email })
                      }
                      className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                          expanded && 'rotate-90',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{account.email}</span>
                      {unread > 0 ? (
                        <span className="text-[11px] tabular-nums text-muted-foreground">{unread}</span>
                      ) : null}
                    </button>
                    {failures.length > 0 ? (
                      <AccountSyncFailure email={account.email} failures={failures} />
                    ) : null}
                  </div>
                  <CollapsibleContent animated={animateFolders}>
                    <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2">
                      {inbox ? (
                        <Link
                          to={`/accounts/${account.id}/mailboxes/${inbox.id}`}
                          onClick={onNavigate}
                          aria-current={inboxActive ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                            inboxActive && 'bg-accent font-medium text-accent-foreground',
                          )}
                        >
                          <Inbox className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="flex-1 truncate">{t('nav.inbox')}</span>
                          {inbox.unread > 0 ? (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {inbox.unread}
                            </span>
                          ) : null}
                        </Link>
                      ) : null}
                      {inbox ? (
                        <Link
                          to={`/accounts/${account.id}/mailboxes/${inbox.id}?view=unread`}
                          onClick={onNavigate}
                          aria-current={unreadActive ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                            unreadActive && 'bg-accent font-medium text-accent-foreground',
                          )}
                        >
                          <MailOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="flex-1 truncate">{t('nav.unread')}</span>
                        </Link>
                      ) : null}
                      {sent ? (
                        <Link
                          to={`/accounts/${account.id}/mailboxes/${sent.id}`}
                          onClick={onNavigate}
                          aria-current={folderActive(sent.id) ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                            folderActive(sent.id) && 'bg-accent font-medium text-accent-foreground',
                          )}
                        >
                          <Send className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="flex-1 truncate">{t('nav.sent')}</span>
                        </Link>
                      ) : null}
                      {drafts ? (
                        <Link
                          to={`/accounts/${account.id}/mailboxes/${drafts.id}`}
                          onClick={onNavigate}
                          aria-current={folderActive(drafts.id) ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                            folderActive(drafts.id) && 'bg-accent font-medium text-accent-foreground',
                          )}
                        >
                          <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="flex-1 truncate">{t('nav.drafts')}</span>
                        </Link>
                      ) : null}
                      {trash ? (
                        <Link
                          to={`/accounts/${account.id}/mailboxes/${trash.id}`}
                          onClick={onNavigate}
                          aria-current={folderActive(trash.id) ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                            folderActive(trash.id) && 'bg-accent font-medium text-accent-foreground',
                          )}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="flex-1 truncate">{t('nav.trash')}</span>
                          {trash.unread > 0 ? (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {trash.unread}
                            </span>
                          ) : null}
                        </Link>
                      ) : null}
                      {junk ? (
                        <Link
                          to={`/accounts/${account.id}/mailboxes/${junk.id}`}
                          onClick={onNavigate}
                          aria-current={folderActive(junk.id) ? 'page' : undefined}
                          className={cn(
                            'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                            folderActive(junk.id) && 'bg-accent font-medium text-accent-foreground',
                          )}
                        >
                          <ShieldAlert
                            className="size-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="flex-1 truncate">{t('nav.junk')}</span>
                          {junk.unread > 0 ? (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {junk.unread}
                            </span>
                          ) : null}
                        </Link>
                      ) : null}
                      <Collapsible open={otherExpanded} onOpenChange={() => toggleOtherAnimated(account.id)}>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            aria-expanded={otherExpanded}
                            aria-label={
                              otherExpanded
                                ? t('nav.collapseSection', { name: t('nav.other') })
                                : t('nav.expandSection', { name: t('nav.other') })
                            }
                            className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          >
                            <ChevronRight
                              className={cn(
                                'size-3.5 transition-transform duration-200',
                                otherExpanded && 'rotate-90',
                              )}
                              aria-hidden="true"
                            />
                            <span className="flex-1 truncate text-left">{t('nav.other')}</span>
                            {otherFolders.length > 0 ? (
                              <Badge variant="muted">{otherFolders.length}</Badge>
                            ) : null}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent animated={animateFolders}>
                          <div className="ml-2 space-y-0.5 border-l pl-2">
                            {otherFolders.length === 0 ? (
                              <p className="px-2 py-1 text-xs text-muted-foreground">
                                {t('common.none')}
                              </p>
                            ) : (
                              otherFolders.map((folder) => (
                                <Link
                                  key={folder.id}
                                  to={`/accounts/${account.id}/mailboxes/${folder.id}`}
                                  onClick={onNavigate}
                                  className={cn(
                                    'flex min-h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent hover:text-accent-foreground',
                                    pathname ===
                                      `/accounts/${account.id}/mailboxes/${folder.id}` &&
                                      'bg-accent font-medium text-accent-foreground',
                                  )}
                                >
                                  <Archive
                                    className="size-3.5 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                  <span className="flex-1 truncate">{folder.name}</span>
                                  {folder.unread > 0 ? (
                                    <span className="text-[11px] tabular-nums text-muted-foreground">
                                      {folder.unread}
                                    </span>
                                  ) : null}
                                </Link>
                              ))
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 border-t px-2 py-1.5">
        <StreamStatusLine />
      </div>
    </div>
  );
}

const STREAM_STATUS: Record<
  StreamStatus,
  { label: string; text: string }
> = {
  connecting: { label: 'nav.stream.connecting', text: 'text-muted-foreground' },
  connected: { label: 'nav.stream.connected', text: 'text-emerald-600 dark:text-emerald-400' },
  retrying: { label: 'nav.stream.retrying', text: 'text-amber-600 dark:text-amber-400' },
  failed: { label: 'nav.stream.failed', text: 'text-destructive' },
};

function StreamStatusLine() {
  const { t } = useTranslation();
  const status = useStreamStatus();
  const view = STREAM_STATUS[status];
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 px-2.5 py-1 text-[11px]',
        view.text,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="truncate">{t(view.label)}</span>
    </div>
  );
}

function AccountSyncFailure({ email, failures }: { email: string; failures: SyncFailure[] }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('nav.sync.errorFor', { email })}
          className="shrink-0 rounded-md p-1 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlertTriangle className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72">
        <p className="text-[13px] font-semibold">{t('nav.sync.errorTitle')}</p>
        <p className="mt-0.5 break-all text-[11px] text-muted-foreground">{email}</p>
        <SyncFailureList failures={failures} />
      </PopoverContent>
    </Popover>
  );
}

function SyncFailureList({ failures }: { failures: SyncFailure[] }) {
  return (
    <ScrollArea as="ul" className="mt-2 max-h-56 space-y-2">
      {failures.map((failure, index) => (
        <li key={`${failure.label}-${index}`} className="space-y-0.5">
          <p className="text-[11px] font-medium">{failure.label}</p>
          <p className="break-words text-[11px] text-muted-foreground">{failure.detail}</p>
        </li>
      ))}
    </ScrollArea>
  );
}

