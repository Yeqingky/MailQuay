import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageTitle, setUnreadCount } from './documentTitle';

beforeEach(() => {
  setPageTitle('');
  setUnreadCount(0);
});

describe('document title', () => {
  it('prefixes the unread count', () => {
    setPageTitle('All mail');
    setUnreadCount(3);

    expect(document.title).toBe('(3) All mail · MailQuay');

    setUnreadCount(0);
    expect(document.title).toBe('All mail · MailQuay');
  });

  it('updates the app badge when supported', () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      value: setAppBadge,
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      configurable: true,
      value: clearAppBadge,
    });

    setPageTitle('All mail');
    setUnreadCount(2);
    expect(setAppBadge).toHaveBeenCalledWith(2);

    setUnreadCount(0);
    expect(clearAppBadge).toHaveBeenCalled();

    Reflect.deleteProperty(navigator, 'setAppBadge');
    Reflect.deleteProperty(navigator, 'clearAppBadge');
  });
});
