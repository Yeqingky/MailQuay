type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

let pageTitle = '';
let unreadCount = 0;

function renderTitle(): void {
  if (typeof document === 'undefined') return;
  const base = pageTitle ? `${pageTitle} · MailQuay` : 'MailQuay';
  document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
}

function updateAppBadge(): void {
  if (typeof navigator === 'undefined') return;
  const badge = navigator as BadgeNavigator;
  try {
    if (unreadCount > 0) {
      void badge.setAppBadge?.(unreadCount)?.catch(() => undefined);
    } else {
      void badge.clearAppBadge?.()?.catch(() => undefined);
    }
  } catch {
    // The badge API is optional and not available in every browser.
  }
}

export function setPageTitle(title: string): void {
  pageTitle = title;
  renderTitle();
}

export function setUnreadCount(count: number): void {
  unreadCount = Math.max(0, Math.floor(count));
  renderTitle();
  updateAppBadge();
}
