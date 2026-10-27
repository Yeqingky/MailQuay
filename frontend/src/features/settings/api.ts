import { api, unwrap, type Schemas } from '@/lib/api/client';

export type Settings = Schemas['Settings'];
export type SettingsUpdate = Schemas['SettingsUpdate'];
export type ResourceInfo = Schemas['ResourceInfo'];
export type ConcurrencySettings = Schemas['ConcurrencySettings'];

export const settingsKeys = {
  all: ['settings'] as const,
  detail: ['settings', 'detail'] as const,
};

export async function fetchSettings(): Promise<Settings> {
  return unwrap(await api.GET('/settings'));
}

export async function updateSettings(body: SettingsUpdate): Promise<Settings> {
  return unwrap(await api.PATCH('/settings', { body }));
}

export async function detectConcurrency(): Promise<ResourceInfo> {
  return unwrap(await api.POST('/settings/concurrency/detect'));
}
