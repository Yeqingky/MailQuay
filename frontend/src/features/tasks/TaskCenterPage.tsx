import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Activity,
  ClipboardCopy,
  Download,
  Inbox,
  MoreHorizontal,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchMailboxTree } from '@/features/mailboxes/api';
import { fetchOutbox, retryOutbox } from '@/features/compose/outbox-api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState, LoadingState } from '@/components/common/States';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/toast';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { cn } from '@/lib/utils';
import { buildTaskQueue } from './aggregate';
import type { Task, TaskSegment } from './aggregate';
import {
  clearLogs,
  dismissTask,
  fetchLogs,
  fetchTasks,
  logKeys,
  retryTask,
  taskKeys,
} from './api';
import type { LogEntry } from './api';

const TABS = ['operations', 'errors', 'logs'] as const;
type TaskCenterTab = (typeof TABS)[number];
const EMPTY_TASKS: Task[] = [];
const EMPTY_LOGS: LogEntry[] = [];

const STATUS_TONE: Record<string, string> = {
  running: '--task-sync',
  pending: '--task-muted',
  failed: '--task-error',
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  initial_sync: Inbox,
  mailbox_sync: Inbox,
  sync: Inbox,
  search_index: Search,
  index: Search,
  body_fetch: Download,
  mark_cache: Download,
  archive_cache: Download,
  fetch: Download,
  outbox_send: Send,
  send: Send,
  account_purge: Trash2,
  cleanup: Trash2,
};

function taskTypeLabel(t: (key: string, options?: Record<string, unknown>) => string, type: string) {
  return t(`tasks.type.${type}`, { defaultValue: t('tasks.type.unknown') });
}

function taskStatusLabel(t: (key: string) => string, segment: TaskSegment): string {
  if (segment.failed) return t('tasks.stats.failed');
  if (segment.pending) return t('tasks.stats.pending');
  return t('tasks.stats.running');
}

function TaskMenu({ task, label }: { task: Task; label: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const outbox = useQuery({
    queryKey: ['outbox', 'list'],
    queryFn: fetchOutbox,
    enabled: task.type === 'outbox_send' || task.type === 'send',
  });
  const matchingOutbox = outbox.data?.find(
    (item) => item.status === 'failed' && (!task.accountId || item.accountId === task.accountId),
  );

  const retry = useMutation({
    mutationFn: () => (matchingOutbox ? retryOutbox(matchingOutbox.id) : retryTask(task.id)),
    onSuccess: () => {
      toast(t('tasks.retried'));
      void queryClient.invalidateQueries({ queryKey: ['outbox'] });
      void queryClient.invalidateQueries({ queryKey: taskKeys.list });
    },
    onError: (error) =>
      toast(t('common.updateFailed'), { description: message(error), variant: 'destructive' }),
  });

  const dismiss = useMutation({
    mutationFn: () => dismissTask(task.id),
    onSuccess: () => {
      toast(t('tasks.dismissed'));
      void queryClient.invalidateQueries({ queryKey: taskKeys.list });
    },
    onError: (error) =>
      toast(t('tasks.dismissFailed'), { description: message(error), variant: 'destructive' }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => retry.mutate()} disabled={retry.isPending}>
          {t('tasks.retry')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => dismiss.mutate()} disabled={dismiss.isPending}>
          {t('tasks.dismiss')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskRow({
  task,
  segment,
  accountEmail,
}: {
  task: Task;
  segment: TaskSegment;
  accountEmail?: string;
}) {
  const { t } = useTranslation();
  const Icon = TYPE_ICONS[segment.type] ?? Activity;
  const tone = STATUS_TONE[segment.status] ?? '--task-muted';
  const failed = segment.failed;

  return (
    <li className="border-b px-4 py-3 last:border-b-0 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{taskTypeLabel(t, segment.type)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {accountEmail ?? t('tasks.globalTask')}
            {segment.message ? ` · ${segment.message}` : ''}
          </p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-1 text-xs"
          style={{
            color: `var(${tone})`,
            backgroundColor: `color-mix(in oklab, var(${tone}) 14%, transparent)`,
          }}
        >
          {taskStatusLabel(t, segment)}
        </span>
        {failed ? <TaskMenu task={task} label={t('tasks.actions')} /> : null}
      </div>
      {failed && segment.error ? (
        <pre className="mt-2 whitespace-pre-wrap break-words pl-11 font-sans text-xs leading-5 text-destructive">
          {segment.error}
        </pre>
      ) : null}
      {!failed && segment.total > 0 ? (
        <div className="pl-11">
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate tabular-nums">
              {t('tasks.counts', { done: segment.done, total: segment.total, unit: segment.unit })}
            </span>
            <span className="shrink-0 tabular-nums">{t('tasks.percent', { percent: segment.percent })}</span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={segment.percent}
            aria-label={taskTypeLabel(t, segment.type)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${segment.percent}%`, backgroundColor: `var(${tone})` }}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function EmptyMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10 text-center">
      <p className="text-xs text-foreground">{children}</p>
    </div>
  );
}

export function TaskCenterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const message = useErrorMessage();
  const [tab, setTab] = useState<TaskCenterTab>('operations');
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const logViewportRef = useRef<HTMLDivElement | null>(null);
  const initialLogScrollDone = useRef(false);
  useDocumentTitle(t('tasks.windowTitle'));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [navigate]);

  const taskQuery = useQuery({
    queryKey: taskKeys.list,
    queryFn: fetchTasks,
    enabled: tab !== 'logs',
  });
  const tasks = taskQuery.data ?? EMPTY_TASKS;
  const queue = useMemo(() => buildTaskQueue(tasks), [tasks]);
  const operations = queue.segments.filter((segment) => !segment.completed && !segment.failed);
  const failures = queue.segments.filter((segment) => segment.failed);
  const mailboxTree = useQuery({
    queryKey: ['mailboxes', 'tree'],
    queryFn: fetchMailboxTree,
    enabled: tab !== 'logs' && tasks.some((task) => Boolean(task.accountId)),
  });
  const emailByAccount = useMemo(() => {
    const result: Record<string, string> = {};
    for (const entry of mailboxTree.data?.accounts ?? []) {
      result[entry.account.id] = entry.account.email;
    }
    return result;
  }, [mailboxTree.data]);

  const logsQuery = useQuery({
    queryKey: logKeys.list,
    queryFn: fetchLogs,
    enabled: tab === 'logs',
    refetchInterval: tab === 'logs' ? 1500 : false,
  });
  const logs = logsQuery.data ?? EMPTY_LOGS;
  useEffect(() => {
    if (logs.length === 0) {
      setSelectedLogId(null);
      return;
    }
    setSelectedLogId((current) =>
      current !== null && logs.some((entry) => entry.id === current)
        ? current
        : logs[logs.length - 1]?.id ?? null,
    );
  }, [logs]);
  useEffect(() => {
    if (tab !== 'logs' || logs.length === 0 || initialLogScrollDone.current) return;
    const viewport = logViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    initialLogScrollDone.current = true;
  }, [logs, tab]);

  const clearMutation = useMutation({
    mutationFn: clearLogs,
    onSuccess: () => {
      queryClient.setQueryData(logKeys.list, []);
      toast(t('tasks.logsCleared'));
    },
    onError: (error) =>
      toast(t('tasks.clearLogsFailed'), { description: message(error), variant: 'destructive' }),
  });

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.map((entry) => entry.line).join('\n'));
      toast(t('tasks.logsCopied'));
    } catch (error) {
      toast(t('tasks.copyLogsFailed'), { description: message(error), variant: 'destructive' });
    }
  };

  const visibleTasks = tab === 'errors' ? failures : operations;
  const visibleRows = visibleTasks.map((segment) => ({
    segment,
    task: tasks.find((item) => item.id === segment.id),
  }));

  const taskPanel = taskQuery.isPending ? (
    <LoadingState className="min-h-full" />
  ) : taskQuery.isError ? (
    <ErrorState
      error={taskQuery.error}
      onRetry={() => void taskQuery.refetch()}
      className="min-h-full"
    />
  ) : visibleRows.length === 0 ? (
    <EmptyMessage>{t(tab === 'errors' ? 'tasks.emptyErrors' : 'tasks.emptyOperations')}</EmptyMessage>
  ) : (
    <ul aria-live="polite">
      {visibleRows.map(({ segment, task }) =>
        task ? (
          <TaskRow
            key={segment.id}
            task={task}
            segment={segment}
            accountEmail={emailByAccount[segment.accountId ?? '']}
          />
        ) : null,
      )}
    </ul>
  );

  const logPanel = logsQuery.isPending ? (
    <LoadingState className="min-h-full" />
  ) : logsQuery.isError ? (
    <ErrorState
      error={logsQuery.error}
      onRetry={() => void logsQuery.refetch()}
      className="min-h-full"
    />
  ) : logs.length === 0 ? (
    <EmptyMessage>{t('tasks.emptyLogs')}</EmptyMessage>
  ) : (
    <ul aria-live="polite" className="py-2">
      {logs.map((entry: LogEntry) => (
        <li key={entry.id}>
          <button
            type="button"
            aria-pressed={selectedLogId === entry.id}
            onClick={() => setSelectedLogId(entry.id)}
            className={cn(
              'block w-full px-3 py-1 text-left text-xs leading-6 text-foreground',
              selectedLogId === entry.id ? 'bg-blue-600 text-white' : 'hover:bg-accent',
            )}
            title={entry.line}
          >
            <span className="break-all">{entry.line}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      role="dialog"
      aria-label={t('tasks.windowTitle')}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card text-foreground"
    >
      <div role="tablist" aria-label={t('tasks.tabs.label')} className="flex h-10 shrink-0 border-b bg-background px-2">
        {TABS.map((key) => (
          <button
            key={key}
            id={`task-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls="task-center-panel"
            onClick={() => setTab(key)}
            className={cn(
              'relative min-w-[60px] px-4 text-xs transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5',
              tab === key
                ? 'font-medium text-foreground after:bg-blue-500'
                : 'text-muted-foreground after:bg-transparent hover:text-foreground',
            )}
          >
            {t(`tasks.tabs.${key}`)}
          </button>
        ))}
      </div>

      <section
        id="task-center-panel"
        role="tabpanel"
        aria-labelledby={`task-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col bg-card"
      >
        {tab === 'logs' ? (
          <ScrollArea
            ref={logViewportRef}
            containerClassName="min-h-0 flex-1"
            className="min-h-full"
          >
            {logPanel}
          </ScrollArea>
        ) : (
          <ScrollArea containerClassName="min-h-0 flex-1" className="min-h-full">
            {taskPanel}
          </ScrollArea>
        )}
      </section>

      {tab === 'logs' ? (
        <footer className="flex h-14 shrink-0 items-center justify-end gap-2 border-t bg-background px-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void copyLogs()} disabled={logs.length === 0}>
            <ClipboardCopy className="size-4" aria-hidden="true" />
            {t('tasks.copyLogs')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => clearMutation.mutate()}
            disabled={logs.length === 0 || clearMutation.isPending}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t('tasks.clearLogs')}
          </Button>
        </footer>
      ) : null}
    </div>
  );
}
