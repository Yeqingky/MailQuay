import { describe, expect, it } from 'vitest';
import type { Task } from './api';
import { buildTaskQueue, canonicalTaskType, taskColorToken } from './aggregate';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'type' | 'status'>): Task {
  return {
    done: 0,
    total: 0,
    unit: 'messages',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('task queue', () => {
  it('returns an empty queue for no tasks', () => {
    const queue = buildTaskQueue([]);
    expect(queue.segments).toEqual([]);
    expect(queue.activeCount).toBe(0);
    expect(queue.failedCount).toBe(0);
    expect(queue.runningCount).toBe(0);
  });

  it('orders running work before queued, failed, and completed work', () => {
    const queue = buildTaskQueue([
      task({ id: 'completed', type: 'search_index', status: 'completed', done: 4, total: 4 }),
      task({ id: 'failed', type: 'search_index', status: 'failed', done: 2, total: 5 }),
      task({ id: 'pending', type: 'body_fetch', status: 'pending', total: 5 }),
      task({ id: 'running', type: 'mailbox_sync', status: 'running', done: 1, total: 10 }),
    ]);
    expect(queue.segments.map((segment) => segment.id)).toEqual([
      'running',
      'pending',
      'failed',
      'completed',
    ]);
    expect(queue.runningCount).toBe(1);
    expect(queue.failedCount).toBe(1);
    expect(queue.activeCount).toBe(2);
  });

  it('computes per-task percentages, clamping done to total', () => {
    const queue = buildTaskQueue([
      task({ id: 'half', type: 'mailbox_sync', status: 'running', done: 5, total: 10 }),
      task({ id: 'over', type: 'body_fetch', status: 'running', done: 9, total: 4 }),
      task({ id: 'unknown', type: 'body_fetch', status: 'running', done: 7 }),
      task({ id: 'done', type: 'search_index', status: 'completed', done: 0, total: 0 }),
    ]);
    const byId = new Map(queue.segments.map((segment) => [segment.id, segment]));
    expect(byId.get('half')?.percent).toBe(50);
    expect(byId.get('over')?.percent).toBe(100);
    expect(byId.get('over')?.done).toBe(4);
    expect(byId.get('unknown')?.percent).toBe(0);
    expect(byId.get('done')?.percent).toBe(100);
  });

  it('maps task types to theme color tokens', () => {
    expect(taskColorToken('initial_sync', false)).toBe('--task-sync');
    expect(taskColorToken('outbox_send', false)).toBe('--task-send');
    expect(taskColorToken('mark_cache', false)).toBe('--task-fetch');
    expect(taskColorToken('search_index', false)).toBe('--task-index');
    expect(taskColorToken('account_purge', false)).toBe('--task-muted');
    expect(taskColorToken('unknown_type', false)).toBe('--task-muted');
    expect(taskColorToken('initial_sync', true)).toBe('--task-error');
  });

  it('shows scope reconciliation as a folder sync', () => {
    expect(canonicalTaskType('scope_reconcile')).toBe('mailbox_sync');
    expect(canonicalTaskType('mailbox_sync')).toBe('mailbox_sync');
    expect(canonicalTaskType('search_index')).toBe('search_index');
    const queue = buildTaskQueue([
      task({ id: 'reconcile', type: 'scope_reconcile', status: 'completed', done: 5, total: 5 }),
    ]);
    expect(queue.segments[0].type).toBe('mailbox_sync');
    expect(queue.segments[0].colorToken).toBe('--task-sync');
  });

  it('ignores cancelled tasks', () => {
    const queue = buildTaskQueue([
      task({ id: 'cancelled', type: 'mailbox_sync', status: 'cancelled', total: 5 }),
    ]);
    expect(queue.segments).toEqual([]);
  });
});
