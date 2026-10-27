import '@/lib/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMailboxTree } from '@/features/mailboxes/api';
import { clearLogs, dismissTask, fetchLogs, fetchTasks, retryTask } from './api';
import type { LogEntry, Task } from './api';
import { TaskCenterPage } from './TaskCenterPage';

vi.mock('@/features/mailboxes/api', () => ({ fetchMailboxTree: vi.fn() }));
vi.mock('@/features/compose/outbox-api', () => ({
  fetchOutbox: vi.fn(),
  retryOutbox: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    clearLogs: vi.fn(),
    dismissTask: vi.fn(),
    fetchLogs: vi.fn(),
    fetchTasks: vi.fn(),
    retryTask: vi.fn(),
  };
});

function Location() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderTaskCenter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tasks']}>
        <Location />
        <TaskCenterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'type' | 'status'>): Task {
  return {
    done: 0,
    total: 0,
    unit: 'messages',
    updatedAt: '2026-10-23T09:35:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchMailboxTree).mockReset();
  vi.mocked(fetchTasks).mockReset();
  vi.mocked(fetchLogs).mockReset();
  vi.mocked(clearLogs).mockReset().mockResolvedValue(undefined);
  vi.mocked(dismissTask).mockReset().mockResolvedValue(undefined);
  vi.mocked(retryTask).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchTasks).mockResolvedValue([]);
  vi.mocked(fetchLogs).mockResolvedValue([]);
});

describe('TaskCenterPage', () => {
  it('shows the three views, empty states, copies logs, clears logs, and closes on Escape', async () => {
    const user = userEvent.setup();
    const logs: LogEntry[] = [
      { id: 10, line: 'time=2026-10-23T09:35:14Z level=INFO msg=sync INBOX' },
      { id: 11, line: 'time=2026-10-23T09:35:15Z level=INFO msg=sync Archive' },
    ];
    vi.mocked(fetchLogs).mockResolvedValue(logs);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    renderTaskCenter();

    expect(await screen.findByText('No operations are in progress.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Errors' }));
    expect(await screen.findByText('No errors.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(await screen.findByText(logs[0].line)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy logs' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(logs.map((entry) => entry.line).join('\n')));

    await user.click(screen.getByRole('button', { name: 'Clear logs' }));
    await waitFor(() => expect(clearLogs).toHaveBeenCalledOnce());
    expect(await screen.findByText('No logs.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('shows failed task details and retains retry and dismiss actions', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask({
        id: 'task-1',
        type: 'mailbox_sync',
        status: 'failed',
        error: 'IMAP authentication failed',
      }),
    ]);

    renderTaskCenter();
    await user.click(screen.getByRole('tab', { name: 'Errors' }));
    expect(await screen.findByText('IMAP authentication failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Task actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Retry' }));
    await waitFor(() => expect(retryTask).toHaveBeenCalledWith('task-1'));
    await user.click(screen.getByRole('button', { name: 'Task actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Dismiss' }));
    await waitFor(() => expect(dismissTask).toHaveBeenCalledWith('task-1'));
  });
});
