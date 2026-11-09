import '@/lib/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationPrompt } from '@/components/layout/NotificationPrompt';
import { useUiStore } from '@/stores/ui';

class MockNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
}

beforeEach(() => {
  MockNotification.permission = 'default';
  MockNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);
  useUiStore.setState({
    desktopNotifications: false,
    notificationSound: false,
    pushActive: false,
    notificationPromptRequested: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useUiStore.setState({
    desktopNotifications: false,
    notificationSound: false,
    pushActive: false,
    notificationPromptRequested: false,
  });
});

describe('NotificationPrompt', () => {
  it('stays hidden during a normal page visit', () => {
    render(<NotificationPrompt />);

    expect(screen.queryByText('Turn on browser notifications')).not.toBeInTheDocument();
  });

  it('shows after login when notifications are not enabled', () => {
    useUiStore.setState({ notificationPromptRequested: true });
    render(<NotificationPrompt />);

    expect(screen.getByText('Turn on browser notifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('stays hidden until the next login after it is closed', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ notificationPromptRequested: true });
    render(<NotificationPrompt />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Turn on browser notifications')).not.toBeInTheDocument();
    expect(useUiStore.getState().notificationPromptRequested).toBe(false);
  });

  it('enables notifications and hides the prompt', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ notificationPromptRequested: true });
    render(<NotificationPrompt />);

    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => {
      expect(useUiStore.getState().desktopNotifications).toBe(true);
    });
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Turn on browser notifications')).not.toBeInTheDocument();
    expect(useUiStore.getState().notificationPromptRequested).toBe(false);
  });

  it('does not prompt when notifications are already enabled', () => {
    MockNotification.permission = 'granted';
    useUiStore.setState({
      desktopNotifications: true,
      notificationPromptRequested: true,
    });
    render(<NotificationPrompt />);

    expect(screen.queryByText('Turn on browser notifications')).not.toBeInTheDocument();
  });

  it('does not prompt when notification permission is denied', () => {
    MockNotification.permission = 'denied';
    useUiStore.setState({ notificationPromptRequested: true });
    render(<NotificationPrompt />);

    expect(screen.queryByText('Turn on browser notifications')).not.toBeInTheDocument();
  });
});
