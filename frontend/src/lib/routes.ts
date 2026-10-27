import type { MailView } from '@/components/layout/Sidebar';

const STATIC_VIEWS: Record<string, MailView> = {
  '/': 'all',
  '/unread': 'unread',
  '/sent': 'sent',
  '/drafts': 'drafts',
  '/trash': 'trash',
  '/marked': 'marked',
  '/archive': 'archive',
  '/tasks': 'tasks',
  '/search': 'search',
};

const FOLDER_PATH = /^\/accounts\/[^/]+\/mailboxes\/[^/]+\/?$/;

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function mailViewFromPathname(pathname: string): MailView {
  const normalized = normalizePathname(pathname);
  if (FOLDER_PATH.test(normalized)) return 'folder';
  return STATIC_VIEWS[normalized] ?? 'all';
}

export function isSettingsPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === '/settings' || normalized.startsWith('/settings/');
}
