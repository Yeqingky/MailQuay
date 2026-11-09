import '@/lib/i18n';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishMailEvent } from '@/lib/events/bus';
import { useUiStore } from '@/stores/ui';
import { useBrowserNotifications } from './useBrowserNotifications';

class MockNotification {
  static permission: NotificationPermission = 'granted';
  static instances: MockNotification[] = [];
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);

  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    MockNotification.instances.push(this);
  }
}

function Harness() {
  useBrowserNotifications();
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderNotifications() {
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

function eventMessage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    accountId: 'acc-1',
    mailboxId: 'mb-1',
    subject: `Subject ${id}`,
    from: { name: 'Alice', email: 'alice@example.com' },
    receivedAt: '2026-10-20T10:00:00Z',
    size: 100,
    unread: true,
    ...overrides,
  };
}

let visibility: DocumentVisibilityState = 'hidden';

beforeEach(() => {
  vi.useFakeTimers();
  MockNotification.instances = [];
  MockNotification.permission = 'granted';
  vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  visibility = 'hidden';
  useUiStore.setState({ desktopNotifications: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useUiStore.setState({ desktopNotifications: false });
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useBrowserNotifications', () => {
  it('coalesces new messages into one notification', () => {
    renderNotifications();

    act(() => {
      publishMailEvent('message.new', { message: eventMessage('m1') });
      publishMailEvent('message.new', { message: eventMessage('m2') });
      vi.advanceTimersByTime(1_000);
    });

    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0]!.title).toBe('2 new messages');
    expect(MockNotification.instances[0]!.options?.body).toBe('Subject m2');
  });

  it('does not notify while the page is visible', () => {
    visibility = 'visible';
    renderNotifications();

    act(() => {
      publishMailEvent('message.new', { message: eventMessage('m1') });
      vi.advanceTimersByTime(1_000);
    });

    expect(MockNotification.instances).toHaveLength(0);
  });

  it('opens the mailbox when the notification is clicked', () => {
    renderNotifications();

    act(() => {
      publishMailEvent('message.new', { message: eventMessage('m1') });
      vi.advanceTimersByTime(1_000);
    });

    const notification = MockNotification.instances[0]!;
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    act(() => {
      notification.onclick?.();
    });

    expect(screen.getByTestId('location')).toHaveTextContent('/accounts/acc-1/mailboxes/mb-1');
  });
});
