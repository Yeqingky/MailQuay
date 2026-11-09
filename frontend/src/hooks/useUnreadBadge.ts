import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMailboxTree, mailboxKeys } from '@/features/mailboxes/api';
import { setUnreadCount } from '@/lib/documentTitle';

/**
 * Mirrors the global unread count into the document title and the optional
 * app badge. The mailbox tree query is shared with the sidebar.
 */
export function useUnreadBadge(): void {
  const query = useQuery({
    queryKey: mailboxKeys.tree,
    queryFn: fetchMailboxTree,
  });
  const unread = query.data?.counts.unread ?? 0;

  useEffect(() => {
    setUnreadCount(unread);
  }, [unread]);

  useEffect(() => () => setUnreadCount(0), []);
}
