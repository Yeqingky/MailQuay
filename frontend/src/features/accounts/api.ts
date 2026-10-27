import { api, apiUrl, unwrap, type Schemas } from '@/lib/api/client';

export type Account = Schemas['Account'];
export type AccountInput = Schemas['AccountInput'];
export type ConnectionTestResult = Schemas['ConnectionTestResult'];
export type DiscoveryResult = Schemas['DiscoveryResult'];

export const accountKeys = {
  all: ['accounts'] as const,
  list: ['accounts', 'list'] as const,
  detail: (id: string) => ['accounts', 'detail', id] as const,
};

export async function fetchAccounts(): Promise<Account[]> {
  const data = unwrap(await api.GET('/accounts'));
  return data.accounts;
}

export async function fetchAccount(id: string): Promise<Account> {
  return unwrap(await api.GET('/accounts/{id}', { params: { path: { id } } }));
}

export async function createAccount(body: AccountInput): Promise<Account> {
  return unwrap(await api.POST('/accounts', { body }));
}

export async function discoverAccount(email: string): Promise<DiscoveryResult> {
  return unwrap(await api.POST('/accounts/discover', { body: { email } }));
}

export type EmclientImportPreview = Schemas['EmclientImportPreview'];
export type EmclientImportResult = Schemas['EmclientImportResult'];

export async function parseEmclientImport(file: File, masterPassword: string): Promise<EmclientImportPreview> {
  const form = new FormData();
  form.append('file', file);
  if (masterPassword) form.append('masterPassword', masterPassword);
  return unwrap(
    await api.POST('/accounts/import/emclient', {
      // openapi-fetch passes FormData through untouched; the generated type
      // models the multipart body as a plain object.
      body: form as unknown as { file: string; masterPassword?: string },
    }),
  );
}

export async function applyEmclientImport(importId: string, emails: string[]): Promise<EmclientImportResult> {
  return unwrap(
    await api.POST('/accounts/import/emclient/{importId}', {
      params: { path: { importId } },
      body: { emails },
    }),
  );
}

export async function updateAccount(id: string, body: AccountInput): Promise<Account> {
  return unwrap(await api.PATCH('/accounts/{id}', { params: { path: { id } }, body }));
}

export async function deleteAccount(id: string): Promise<void> {
  const result = await api.DELETE('/accounts/{id}', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export async function testAccount(id: string): Promise<ConnectionTestResult> {
  return unwrap(await api.POST('/accounts/{id}/test', { params: { path: { id } } }));
}

export async function requestAccountSync(id: string): Promise<void> {
  const result = await api.POST('/accounts/{id}/sync', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export async function reconcileAccount(id: string): Promise<void> {
  const result = await api.POST('/accounts/{id}/reconcile', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export function oauthStartUrl(provider: 'google' | 'microsoft', accountId?: string): string {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  return apiUrl(`/oauth/${provider}/start${query}`);
}
