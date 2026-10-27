import { useQuery } from '@tanstack/react-query';
import { accountKeys, fetchAccounts, type Account } from '@/features/accounts/api';

export interface Sender {
  accountId: string;
  email: string;
  name: string;
  defaultSendName: string;
  defaultReplyTo: string;
}

export function senderFromAccount(account: Account): Sender {
  return {
    accountId: account.id,
    email: account.email,
    name: account.name,
    defaultSendName: account.defaultSendName ?? '',
    defaultReplyTo: account.defaultReplyTo ?? '',
  };
}

// senderName is the From display name. It falls back to the account name.
export function senderName(sender: Sender): string {
  return sender.defaultSendName.trim() || sender.name;
}

// senderReplyTo is the Reply-To prefilled in compose. It falls back to the
// sender address when the account has no default.
export function senderReplyTo(sender: Sender): string {
  return sender.defaultReplyTo.trim() || sender.email;
}

export function useSenders() {
  return useQuery({
    queryKey: accountKeys.list,
    queryFn: fetchAccounts,
    select: (accounts): Sender[] => accounts.map(senderFromAccount),
    staleTime: 60_000,
  });
}

export function resolveDefaultSender(
  senders: Sender[] | undefined,
  preferredAccountId?: string,
): Sender | undefined {
  if (!senders || senders.length === 0) return undefined;
  if (preferredAccountId) {
    const preferred = senders.find((sender) => sender.accountId === preferredAccountId);
    if (preferred) return preferred;
  }
  return senders[0];
}

const LAST_SENDER_KEY = 'mailquay:last-sender';

export function rememberSender(sender: Sender): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_SENDER_KEY, sender.accountId);
}

export function recallSender(senders: Sender[] | undefined): Sender | undefined {
  if (!senders || typeof window === 'undefined') return undefined;
  const accountId = window.localStorage.getItem(LAST_SENDER_KEY);
  if (!accountId) return undefined;
  return senders.find((sender) => sender.accountId === accountId);
}
