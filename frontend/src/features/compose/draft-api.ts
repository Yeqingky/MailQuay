import { api, unwrap, type Schemas } from '@/lib/api/client';

export type Draft = Schemas['Draft'];
export type DraftInput = Schemas['DraftInput'];
export type DraftUpdateRequest = Schemas['DraftUpdateRequest'];
export type UploadedAttachment = Schemas['UploadedAttachment'];

export const draftKeys = {
  all: ['drafts'] as const,
  list: (accountId?: string) => ['drafts', 'list', accountId ?? 'all'] as const,
  detail: (id: string) => ['drafts', 'detail', id] as const,
};

export async function fetchDrafts(accountId?: string): Promise<Draft[]> {
  const data = unwrap(
    await api.GET('/drafts', { params: { query: accountId ? { accountId } : {} } }),
  );
  return data.drafts;
}

export async function fetchDraft(id: string): Promise<Draft> {
  return unwrap(await api.GET('/drafts/{id}', { params: { path: { id } } }));
}

export async function createDraft(body: DraftInput): Promise<Draft> {
  return unwrap(await api.POST('/drafts', { body }));
}

export async function updateDraft(id: string, body: DraftUpdateRequest): Promise<Draft> {
  return unwrap(await api.PATCH('/drafts/{id}', { params: { path: { id } }, body }));
}

export async function deleteDraft(id: string): Promise<void> {
  const result = await api.DELETE('/drafts/{id}', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export async function syncDraft(id: string): Promise<void> {
  const result = await api.POST('/drafts/{id}/sync', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}

export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  // openapi-typescript models multipart binary fields as string; the serializer
  // replaces that representation with the actual File inside FormData.
  const body = { file } as unknown as { file: string };
  return unwrap(
    await api.POST('/attachments', {
      body,
      bodySerializer: () => {
        const formData = new FormData();
        formData.append('file', file);
        return formData;
      },
    }),
  );
}
