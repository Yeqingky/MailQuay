import { api, unwrap, type Schemas } from '@/lib/api/client';

export type OutboxItem = Schemas['OutboxItem'];
export type SendRequest = Schemas['SendRequest'];

export async function fetchOutbox(): Promise<OutboxItem[]> {
  const data = unwrap(await api.GET('/outbox'));
  return data.items;
}

export async function sendMessage(body: SendRequest): Promise<OutboxItem> {
  return unwrap(await api.POST('/messages/send', { body }));
}

export async function retryOutbox(id: string): Promise<void> {
  const result = await api.POST('/outbox/{id}/retry', { params: { path: { id } } });
  if (result.response.ok) return;
  unwrap(result);
}
