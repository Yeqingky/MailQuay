import { api, apiUrl, unwrap, type Schemas } from '@/lib/api/client';

export type ArchiveEntry = Schemas['ArchiveEntry'];
export type ArchivePage = Schemas['ArchivePage'];
export type ArchiveBody = Schemas['MessageBody'];

export const archiveKeys = {
  all: ['archive'] as const,
  list: (cursor?: string) => ['archive', 'list', cursor ?? 'first'] as const,
  detail: (id: string) => ['archive', 'detail', id] as const,
  body: (id: string) => ['archive', 'body', id] as const,
};

export async function fetchArchives(cursor?: string, limit = 50): Promise<ArchivePage> {
  return unwrap(await api.GET('/archive', { params: { query: { cursor, limit } } }));
}

export async function fetchArchive(id: string): Promise<ArchiveEntry> {
  return unwrap(await api.GET('/archive/{id}', { params: { path: { id } } }));
}

export async function fetchArchiveBody(id: string): Promise<ArchiveBody> {
  return unwrap(await api.GET('/archive/{id}/body', { params: { path: { id } } }));
}

export function archiveRawUrl(id: string): string {
  return apiUrl(`/archive/${encodeURIComponent(id)}/raw`);
}

export function archiveAttachmentUrl(id: string, attachmentId: string): string {
  return apiUrl(
    `/archive/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}
