import { api, unwrap } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/client';

export type Task = Schemas['Task'];
export type LogEntry = Schemas['LogEntry'];

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

export async function fetchLogs(): Promise<LogEntry[]> {
  const data = unwrap(await api.GET('/logs'));
  return data.logs;
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
