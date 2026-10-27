import '@/lib/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { MailboxTree } from '@/features/mailboxes/api';
import { fetchMailboxTree } from '@/features/mailboxes/api';
import { fetchTasks } from '@/features/tasks/api';
import { useUiStore } from '@/stores/ui';
import { Sidebar, type MailView } from './Sidebar';

vi.mock('@/features/mailboxes/api', () => ({ fetchMailboxTree: vi.fn() }));
vi.mock('@/features/tasks/api', () => ({ fetchTasks: vi.fn() }));

function makeTree(options: {
  syncState?: 'idle' | 'error';
  folderError?: string;
  accountError?: string;
}): MailboxTree {
  return {
    accounts: [
      {
        account: {
          id: 'acc-1',
          name: 'Owner',
          email: 'owner@example.com',
          state: options.accountError ? 'error' : 'connected',
          lastError: options.accountError,
        },
        folders: [
          {
            id: 'mb-1',
            accountId: 'acc-1',
            path: 'INBOX',
            name: 'Inbox',
            role: 'inbox',
            localOnly: false,
            syncMode: 'full',
            total: 0,
            unread: 0,
            syncState: options.syncState ?? 'idle',
            lastError: options.folderError,
          },
        ],
        other: [],
      },
    ],
    counts: { all: 0, unread: 0, marked: 0, drafts: 0, sent: 0, trash: 0 },
  } as unknown as MailboxTree;
}

function renderSidebar(options: { path?: string; view?: MailView } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.path ?? '/']}>
        <Sidebar currentView={options.view ?? 'all'} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar sync failures', () => {
  it('shows the failed folder error when the sync alert is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMailboxTree).mockResolvedValue(
      makeTree({ syncState: 'error', folderError: 'AUTHENTICATIONFAILED invalid credentials' }),
    );
    vi.mocked(fetchTasks).mockResolvedValue([]);
    renderSidebar();

    await screen.findByText('owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Sync error for owner@example.com' }));

    expect(await screen.findByText('Mailbox sync failed')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('AUTHENTICATIONFAILED invalid credentials')).toBeInTheDocument();
  });

  it('reports an account level failure with its message', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMailboxTree).mockResolvedValue(
      makeTree({ accountError: 'connect: connection refused' }),
    );
    vi.mocked(fetchTasks).mockResolvedValue([]);
    renderSidebar();

    await screen.findByText('owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Sync error for owner@example.com' }));

    expect(await screen.findByText('Account connection')).toBeInTheDocument();
    expect(screen.getByText('connect: connection refused')).toBeInTheDocument();
  });

  it('shows no alert while every folder syncs cleanly', async () => {
    vi.mocked(fetchMailboxTree).mockResolvedValue(makeTree({}));
    vi.mocked(fetchTasks).mockResolvedValue([]);
    renderSidebar();

    await screen.findByText('owner@example.com');
    expect(screen.queryByRole('button', { name: /sync error for/i })).not.toBeInTheDocument();
  });
});

describe('Sidebar folder selection', () => {
  it('highlights the unread filter instead of the inbox for view=unread', async () => {
    vi.mocked(fetchMailboxTree).mockResolvedValue(makeTree({}));
    vi.mocked(fetchTasks).mockResolvedValue([]);
    useUiStore.setState({ expandedAccounts: { 'acc-1': true } });

    renderSidebar({ path: '/accounts/acc-1/mailboxes/mb-1?view=unread', view: 'folder' });

    await screen.findByText('owner@example.com');
    const unreadLink = screen
      .getAllByRole('link', { name: 'Unread' })
      .find((link) => link.getAttribute('href')?.includes('view=unread'));
    expect(unreadLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inbox' })).not.toHaveAttribute('aria-current');

    useUiStore.setState({ expandedAccounts: {} });
  });
});
