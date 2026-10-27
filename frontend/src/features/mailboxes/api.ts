import { api, unwrap, type Schemas } from '@/lib/api/client';

export type MailboxTree = Schemas['MailboxTree'];
export type Mailbox = Schemas['Mailbox'];
export type AccountMailboxes = Schemas['AccountMailboxes'];

export const mailboxKeys = {
  tree: ['mailboxes', 'tree'] as const,
  detail: (mailboxId: string) => ['mailboxes', 'detail', mailboxId] as const,
};

export async function fetchMailboxTree(): Promise<MailboxTree> {
  return unwrap(await api.GET('/mailboxes'));
}

export async function fetchMailbox(mailboxId: string): Promise<Mailbox> {
  return unwrap(await api.GET('/mailboxes/{id}', { params: { path: { id: mailboxId } } }));
}

export async function updateMailboxSyncMode(
  mailboxId: string,
  syncMode: Mailbox['syncMode'],
): Promise<Mailbox> {
  return unwrap(
    await api.PATCH('/mailboxes/{id}', {
      params: { path: { id: mailboxId } },
      body: { syncMode },
    }),
  );
}

export async function requestAllSync(): Promise<void> {
  const result = await api.POST('/sync');
  if (result.response.ok) return;
  unwrap(result);
}

export async function requestMailboxSync(mailboxId: string): Promise<void> {
  const result = await api.POST('/mailboxes/{id}/sync', {
    params: { path: { id: mailboxId } },
  });
  if (result.response.ok) return;
  unwrap(result);
}

export function systemMailbox(
  entry: AccountMailboxes,
  role: Mailbox['role'],
): Mailbox | undefined {
  return entry.folders.find((folder) => folder.role === role);
}

export function findMailbox(tree: MailboxTree | undefined, mailboxId: string): Mailbox | undefined {
  if (!tree) return undefined;
  for (const entry of tree.accounts) {
    const match = [...entry.folders, ...entry.other].find((folder) => folder.id === mailboxId);
    if (match) return match;
  }
  return undefined;
}

export function findAccountEntry(
  tree: MailboxTree | undefined,
  accountId: string,
): AccountMailboxes | undefined {
  return tree?.accounts.find((entry) => entry.account.id === accountId);
}
