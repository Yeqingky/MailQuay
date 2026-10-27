import { apiUrl } from '@/lib/api/client';

export function messageRawUrl(messageId: string): string {
  return apiUrl(`/messages/${encodeURIComponent(messageId)}/raw`);
}

export function messageAttachmentUrl(messageId: string, attachmentId: string): string {
  return apiUrl(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}
