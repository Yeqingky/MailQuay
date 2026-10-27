import type { Schemas } from '@/lib/api/client';

export type Task = Schemas['Task'];
export type TaskStatus = Task['status'];

export type TaskColorToken =
  | '--task-sync'
  | '--task-send'
  | '--task-fetch'
  | '--task-index'
  | '--task-muted'
  | '--task-error';

export interface TaskSegment {
  id: string;
  type: string;
  sourceType: string;
  status: TaskStatus;
  colorToken: TaskColorToken;
  done: number;
  total: number;
  unit: string;
  accountId?: string;
  message?: string;
  completedAt?: string;
  error?: string;
  pending: boolean;
  failed: boolean;
  completed: boolean;
  percent: number;
}

export interface TaskQueue {
  segments: TaskSegment[];
  runningCount: number;
  failedCount: number;
  activeCount: number;
}

const TASK_TOKEN_BY_TYPE: Record<string, TaskColorToken> = {
  initial_sync: '--task-sync',
  mailbox_sync: '--task-sync',
  scope_reconcile: '--task-sync',
  sync: '--task-sync',
  outbox_send: '--task-send',
  send: '--task-send',
  body_fetch: '--task-fetch',
  mark_cache: '--task-fetch',
  archive_cache: '--task-fetch',
  fetch: '--task-fetch',
  search_index: '--task-index',
  index: '--task-index',
  account_purge: '--task-muted',
  cleanup: '--task-muted',
};

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  pending: 1,
  failed: 2,
  completed: 3,
};

// Some task types describe the same user-visible work. Scope reconciliation
// only trims local data to the account's current range, so it is shown as a
// folder sync instead of naming the internal step.
const TASK_TYPE_ALIASES: Record<string, string> = {
  scope_reconcile: 'mailbox_sync',
};

export function canonicalTaskType(type: string): string {
  return TASK_TYPE_ALIASES[type] ?? type;
}

export function taskColorToken(type: string, failed: boolean): TaskColorToken {
  if (failed) return '--task-error';
  return TASK_TOKEN_BY_TYPE[type] ?? '--task-muted';
}

// buildTaskQueue sorts tasks for the task center: running work first, then
// queued work, then failures waiting on the user, then finished work.
export function buildTaskQueue(tasks: Task[]): TaskQueue {
  const segments: TaskSegment[] = [];
  let runningCount = 0;
  let failedCount = 0;

  for (const task of tasks) {
    if (task.status === 'cancelled') continue;
    const failed = task.status === 'failed';
    const completed = task.status === 'completed';
    const total = Math.max(0, task.total ?? 0);
    const done = Math.max(0, Math.min(task.done ?? 0, total || Number.MAX_SAFE_INTEGER));
    if (task.status === 'running') runningCount += 1;
    if (failed) failedCount += 1;
    segments.push({
      id: task.id,
      type: canonicalTaskType(task.type),
      sourceType: task.type,
      status: task.status,
      colorToken: taskColorToken(task.type, failed),
      done,
      total,
      unit: task.unit,
      accountId: task.accountId,
      message: task.message,
      completedAt: task.completedAt,
      error: task.error,
      pending: task.status === 'pending',
      failed,
      completed,
      percent:
        total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : completed ? 100 : 0,
    });
  }

  segments.sort((left, right) => {
    const order = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);
    if (order !== 0) return order;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  return {
    segments,
    runningCount,
    failedCount,
    activeCount: segments.filter((segment) => !segment.completed && !segment.failed).length,
  };
}
