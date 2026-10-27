import { api, unwrap } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/client';

export type Task = Schemas['Task'];
export type LogEntry = Schemas['LogEntry'];

// LogsSnapshot pairs the retained records with the streaming cursor that
// resumes right after the newest one.
export interface LogsSnapshot {
  logs: LogEntry[];
  cursor: string;
}

export const taskKeys = {
  all: ['tasks'] as const,
  list: ['tasks', 'list'] as const,
};

export const logKeys = {
  list: ['logs', 'list'] as const,
};

export async function fetchTasks(): Promise<Task[]> {
  const data = unwrap(await api.GET('/tasks'));
  return data.tasks;
}

export async function fetchLogs(): Promise<LogsSnapshot> {
  const data = unwrap(await api.GET('/logs'));
  return { logs: data.logs, cursor: data.cursor };
}

export async function clearLogs(): Promise<void> {
  const result = await api.DELETE('/logs');
  if (result.response.ok) return;
  unwrap(result);
}

export async function dismissTask(id: string): Promise<void> {
  const result = await api.POST('/tasks/{id}/dismiss', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export async function retryTask(id: string): Promise<void> {
  const result = await api.POST('/tasks/{id}/retry', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}
