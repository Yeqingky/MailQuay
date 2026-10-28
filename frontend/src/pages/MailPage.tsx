import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/common/States';
import { MessagesWorkspace } from '@/features/message-list/MessagesWorkspace';
import { useMessageList } from '@/features/message-list/useMessages';
import type { ListMessagesParams, MessageSummary } from '@/features/message-list/api';
import { fetchMailboxTree, requestMailboxSync } from '@/features/mailboxes/api';
import { SearchFiltersPanel } from '@/features/search/SearchFiltersPanel';
import {
  hasScopedCriteria,
  useSearchMessages,
  type SearchScope,
} from '@/features/search/useSearch';
import { useSearchStore } from '@/stores/search';
import { ArchivePage } from '@/features/archive/ArchivePage';
import { DraftsPage } from '@/features/compose/DraftsPage';
import { TaskCenterPage } from '@/features/tasks/TaskCenterPage';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { EASE_OUT } from '@/lib/motion';
import { mailViewFromPathname } from '@/lib/routes';

function useFolderRoute() {
  const { accountId = '', mailboxId = '' } = useParams();
  const [params] = useSearchParams();
  return {
    accountId,
    mailboxId,
    unreadOnly: params.get('view') === 'unread',
  };
}

export function MailPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const view = mailViewFromPathname(pathname);
  const folderRoute = useFolderRoute();
  const panelOpen = useSearchStore((state) => state.panelOpen);
  const applied = useSearchStore((state) => state.applied);
  const reduceMotion = useReducedMotion();
  useDocumentTitle('');

  const scope = useMemo<SearchScope>(
    () =>
      view === 'folder'
        ? { accountId: folderRoute.accountId, mailboxId: folderRoute.mailboxId }
        : {},
    [view, folderRoute.accountId, folderRoute.mailboxId],
  );
  const showPanel = panelOpen && view !== 'tasks';
  const searchActive = showPanel && hasScopedCriteria(applied, scope);

  let content: ReactNode;
  if (view === 'drafts') {
    content = <DraftsPage />;
  } else if (view === 'tasks') {
    content = <TaskCenterPage />;
  } else if (view === 'archive') {
    content = <ArchivePage />;
  } else if (view === 'folder') {
    content = <FolderPage folderRoute={folderRoute} />;
  } else if (view === 'sent' || view === 'trash') {
    content = <MultiMailboxPage view={view} />;
  } else if (view === 'all' || view === 'unread' || view === 'marked') {
    content = <GlobalViewPage view={view} />;
  } else {
    content = (
      <EmptyState
        title={t('errors.notFound')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t('nav.all')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AnimatePresence initial={false}>
        {showPanel ? (
          <motion.div
            key="search-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
            className="shrink-0 overflow-hidden"
          >
            <SearchFiltersPanel showAccountFilter={!scope.accountId} />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex min-h-0 flex-1 flex-col">
        {searchActive ? <SearchResults scope={scope} /> : content}
      </div>
    </div>
  );
}

const GLOBAL_VIEW_KEYS = {
  all: { title: 'mail.allTitle', empty: 'mail.emptyBody' },
  unread: { title: 'mail.unreadTitle', empty: 'mail.emptyBody' },
  marked: { title: 'mail.markedTitle', empty: 'mail.emptyBody' },
} as const;

const UNIFIED_HIDDEN_ROLES = new Set(['sent', 'drafts', 'trash']);

function inUnifiedView(message: MessageSummary): boolean {
  return !UNIFIED_HIDDEN_ROLES.has(message.mailboxRole ?? '');
}

const GLOBAL_MATCHERS = {
  all: inUnifiedView,
  unread: (message: MessageSummary) => message.unread && inUnifiedView(message),
  marked: (message: MessageSummary) => message.marked,
} as const;

function GlobalViewPage({ view }: { view: 'all' | 'unread' | 'marked' }) {
  const { t } = useTranslation();
  const params = useMemo<ListMessagesParams>(() => ({ view, limit: 50 }), [view]);
  const scope = useMemo(
    () => ({ params, matches: GLOBAL_MATCHERS[view] }),
    [params, view],
  );
  const query = useMessageList(params);
  return (
    <MessagesWorkspace
      title={t(GLOBAL_VIEW_KEYS[view].title)}
      messages={query.messages}
      query={{
        isPending: query.isPending,
        isError: query.isError,
        error: query.error,
        refetch: () => void query.refetch(),
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => void query.fetchNextPage(),
      }}
      showAccountBadge
      emptyTitle={t('mail.emptyTitle')}
      emptyBody={t(GLOBAL_VIEW_KEYS[view].empty)}
      scope={scope}
      resetKey={view}
    />
  );
}

function FolderPage({
  folderRoute,
}: {
  folderRoute: { accountId: string; mailboxId: string; unreadOnly: boolean };
}) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const tree = useQuery({ queryKey: ['mailboxes', 'tree'], queryFn: fetchMailboxTree });
  const mailbox = tree.data?.accounts
    .flatMap((entry) => [...entry.folders, ...entry.other])
    .find((folder) => folder.id === folderRoute.mailboxId);
  useEffect(() => {
    if (!mailbox || mailbox.localOnly || mailbox.syncMode === 'off' || mailbox.role === 'drafts') {
      return;
    }
    let active = true;
    void requestMailboxSync(mailbox.id).catch((error: unknown) => {
      if (!active) return;
      toast(t('common.updateFailed'), {
        description: message(error),
        variant: 'destructive',
      });
    });
    return () => {
      active = false;
    };
  }, [mailbox?.id, mailbox?.localOnly, mailbox?.role, mailbox?.syncMode, message, t]);
  const params = useMemo<ListMessagesParams>(
    () => ({
      view: folderRoute.unreadOnly ? 'unread' : 'mailbox',
      accountId: folderRoute.accountId || undefined,
      mailboxId: folderRoute.mailboxId || undefined,
      limit: 50,
    }),
    [folderRoute.accountId, folderRoute.mailboxId, folderRoute.unreadOnly],
  );
  const matches = useCallback(
    (message: MessageSummary) =>
      message.accountId === folderRoute.accountId &&
      message.mailboxId === folderRoute.mailboxId &&
      (!folderRoute.unreadOnly || message.unread),
    [folderRoute.accountId, folderRoute.mailboxId, folderRoute.unreadOnly],
  );
  const scope = useMemo(() => ({ params, matches }), [matches, params]);
  const query = useMessageList(params, Boolean(folderRoute.mailboxId));
  const title = mailbox
    ? `${mailbox.name}${folderRoute.unreadOnly ? ` · ${t('mail.unreadTitle')}` : ''}`
    : t('mail.folderTitle');
  const readOnly = mailbox?.role === 'sent';

  if (!folderRoute.mailboxId) {
    return (
      <EmptyState
        title={t('errors.notFound')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t('nav.all')}</Link>
          </Button>
        }
      />
    );
  }

  if (tree.isPending) {
    return (
      <MessagesWorkspace
        title={title}
        messages={[]}
        query={{
          isPending: true,
          isError: false,
          error: undefined,
          refetch: () => void tree.refetch(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: () => undefined,
        }}
        showAccountBadge={false}
        emptyTitle={t('mail.emptyTitle')}
        emptyBody={t('mail.emptyBody')}
        readOnly={readOnly}
      />
    );
  }

  if (!mailbox) {
    return (
      <EmptyState
        title={t('errors.notFound')}
        description={t('mail.folderDescription')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t('nav.all')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <MessagesWorkspace
      title={title}
      messages={query.messages}
      query={{
        isPending: query.isPending,
        isError: query.isError,
        error: query.error,
        refetch: () => void query.refetch(),
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => void query.fetchNextPage(),
      }}
      showAccountBadge={false}
      emptyTitle={t('mail.emptyTitle')}
      emptyBody={t('mail.emptyBody')}
      readOnly={readOnly}
      scope={scope}
      resetKey={`${folderRoute.accountId}:${folderRoute.mailboxId}:${folderRoute.unreadOnly}`}
    />
  );
}

function MultiMailboxPage({ view }: { view: 'sent' | 'trash' }) {
  const { t } = useTranslation();
  const query = useMessageList({ view, limit: 50 });
  return (
    <MessagesWorkspace
      title={view === 'sent' ? t('mail.sentTitle') : t('mail.trashTitle')}
      messages={query.messages}
      query={{
        isPending: query.isPending,
        isError: query.isError,
        error: query.error,
        refetch: () => void query.refetch(),
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => void query.fetchNextPage(),
      }}
      showAccountBadge
      emptyTitle={t('mail.emptyTitle')}
      emptyBody={t('mail.emptyBody')}
      readOnly={view === 'sent'}
      resetKey={view}
    />
  );
}

function SearchResults({ scope }: { scope: SearchScope }) {
  const { t } = useTranslation();
  const applied = useSearchStore((state) => state.applied);
  const query = useSearchMessages(applied, scope);
  const title = applied.q
    ? t('search.resultsFor', { query: applied.q })
    : t('search.results');

  return (
    <MessagesWorkspace
      title={title}
      messages={query.messages}
      query={{
        isPending: query.enabled && query.isPending,
        isError: query.isError,
        error: query.error,
        refetch: () => void query.refetch(),
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => void query.fetchNextPage(),
      }}
      showAccountBadge
      emptyTitle={query.enabled ? t('search.noResultsTitle') : t('search.title')}
      emptyBody={query.enabled ? t('search.noResultsBody') : t('search.emptyQuery')}
      errorTitle={t('search.unavailable')}
      resetKey={JSON.stringify(applied)}
    />
  );
}
