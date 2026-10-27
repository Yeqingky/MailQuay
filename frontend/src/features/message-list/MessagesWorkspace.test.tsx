import '@/lib/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/ui';
import { publishMailEvent } from '@/lib/events/bus';
import type { MessageSummary } from './api';
import { fetchMessage, fetchMessages, messageKeys } from './api';
import { MessagesWorkspace, type WorkspaceQuery } from './MessagesWorkspace';
import { useMessageList } from './useMessages';
import { useMailListPreferences } from './useMailListPreferences';

vi.mock('@/features/message-view/MessageReader', () => ({
  MessageReader: ({ messageId }: { messageId: string }) => <div>reader:{messageId}</div>,
}));

vi.mock('@/features/compose/useComposeLauncher', () => ({
  useComposeLauncher: () => ({ launch: vi.fn() }),
}));

vi.mock('./useMailListPreferences', () => ({ useMailListPreferences: vi.fn() }));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchMessage: vi.fn(), fetchMessages: vi.fn() };
});

const params = { view: 'unread' as const, limit: 50 };

function makeMessage(overrides: Partial<MessageSummary> & { id: string }): MessageSummary {
  return {
    accountId: 'acc-1',
    mailboxId: 'mb-1',
    subject: 'Subject',
    from: { name: 'Alice', email: 'alice@example.com' },
    receivedAt: '2026-10-20T10:00:00Z',
    size: 100,
    unread: true,
    marked: false,
    hasAttachments: false,
    bodyState: 'cached',
    ...overrides,
  };
}

const queryStub: WorkspaceQuery = {
  isPending: false,
  isError: false,
  error: undefined,
  refetch: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
};

function renderWorkspace(options: {
  messages: MessageSummary[];
  removeReadImmediately: boolean;
  prependNewMessages: boolean;
  client?: QueryClient;
  resetKey?: string;
}) {
  vi.mocked(useMailListPreferences).mockReturnValue({
    removeReadImmediately: options.removeReadImmediately,
    prependNewMessages: options.prependNewMessages,
  });
  const client =
    options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (messages: MessageSummary[], resetKey = options.resetKey) => (
    <QueryClientProvider client={client}>
      <MessagesWorkspace
        title="Unread"
        messages={messages}
        query={queryStub}
        showAccountBadge={false}
        emptyTitle="No messages"
        emptyBody="Nothing here"
        resetKey={resetKey}
        scope={{
          params,
          matches: (message) => message.unread && message.accountId === 'acc-1',
        }}
      />
    </QueryClientProvider>
  );
  const result = render(ui(options.messages));
  return {
    ...result,
    client,
    rerenderWith: (messages: MessageSummary[], resetKey?: string) =>
      result.rerender(ui(messages, resetKey)),
  };
}

describe('MessagesWorkspace selection', () => {
  beforeEach(() => {
    useUiStore.setState({ mobilePane: 'list' });
  });

  it('keeps the reader and the row when a read message is retained', async () => {
    const user = userEvent.setup();
    const message = makeMessage({ id: 'm1' });
    const view = renderWorkspace({
      messages: [message],
      removeReadImmediately: false,
      prependNewMessages: true,
    });

    await user.click(screen.getByRole('button', { name: 'Open message from Alice' }));
    expect(screen.getByText('reader:m1')).toBeInTheDocument();

    view.rerenderWith([{ ...message, unread: false }]);

    expect(screen.getByText('reader:m1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open message from Alice' })).toBeInTheDocument();
  });

  it('renders snippet highlights instead of literal mark tags', () => {
    const message = makeMessage({ id: 'm1', snippet: 'the <mark>invoice</mark> is late' });
    const view = renderWorkspace({
      messages: [message],
      removeReadImmediately: false,
      prependNewMessages: true,
    });

    expect(screen.getByText('invoice').tagName).toBe('MARK');
    expect(view.container.textContent).toContain('the invoice is late');
    expect(view.container.textContent).not.toContain('<mark>');
  });

  it('drops the read row immediately but keeps the reader open', async () => {
    const user = userEvent.setup();
    const message = makeMessage({ id: 'm1' });
    const view = renderWorkspace({
      messages: [message],
      removeReadImmediately: true,
      prependNewMessages: true,
    });

    await user.click(screen.getByRole('button', { name: 'Open message from Alice' }));
    view.rerenderWith([{ ...message, unread: false }]);

    expect(screen.getByText('reader:m1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open message from Alice' }),
    ).not.toBeInTheDocument();
  });

  it('removes the retained row after selecting another message', async () => {
    const user = userEvent.setup();
    const first = makeMessage({ id: 'm1' });
    const second = makeMessage({
      id: 'm2',
      from: { name: 'Bob', email: 'bob@example.com' },
      subject: 'Second',
    });
    const view = renderWorkspace({
      messages: [first, second],
      removeReadImmediately: false,
      prependNewMessages: true,
    });

    await user.click(screen.getByRole('button', { name: 'Open message from Alice' }));
    view.rerenderWith([{ ...first, unread: false }, second]);
    expect(screen.getByRole('button', { name: 'Open message from Alice' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open message from Bob' }));

    expect(screen.queryByRole('button', { name: 'Open message from Alice' })).not.toBeInTheDocument();
    expect(screen.getByText('reader:m2')).toBeInTheDocument();
  });

  it('clears the reader when the view key changes', async () => {
    const user = userEvent.setup();
    const message = makeMessage({ id: 'm1' });
    const view = renderWorkspace({
      messages: [message],
      removeReadImmediately: false,
      prependNewMessages: true,
      resetKey: 'folder-a',
    });

    await user.click(screen.getByRole('button', { name: 'Open message from Alice' }));
    expect(screen.getByText('reader:m1')).toBeInTheDocument();

    view.rerenderWith([message], 'folder-b');

    expect(screen.queryByText('reader:m1')).not.toBeInTheDocument();
  });

  it('queues new messages behind a notice when automatic insertion is off', async () => {
    vi.mocked(fetchMessage).mockResolvedValue(
      makeMessage({ id: 'm3', subject: 'Arrived' }) as never,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(messageKeys.list(params), {
      pages: [{ messages: [] }],
      pageParams: [undefined],
    });
    renderWorkspace({
      messages: [],
      removeReadImmediately: false,
      prependNewMessages: false,
      client,
    });

    publishMailEvent('message.new', { messageId: 'm3', accountId: 'acc-1' });

    const notice = await screen.findByRole('button', { name: /1 new message/ });
    await userEvent.setup().click(notice);

    await waitFor(() => {
      const data = client.getQueryData<{ pages: { messages: MessageSummary[] }[] }>(
        messageKeys.list(params),
      );
      expect(data?.pages[0].messages.map((message) => message.id)).toEqual(['m3']);
    });
    expect(screen.queryByRole('button', { name: /new message/ })).not.toBeInTheDocument();
  });

  it('inserts new messages at the top when automatic insertion is on', async () => {
    vi.mocked(useMailListPreferences).mockReturnValue({
      removeReadImmediately: false,
      prependNewMessages: true,
    });
    const existing = makeMessage({ id: 'm1' });
    vi.mocked(fetchMessages).mockResolvedValue({ messages: [existing] });
    vi.mocked(fetchMessage).mockResolvedValue(
      makeMessage({
        id: 'm3',
        from: { name: 'Carol', email: 'carol@example.com' },
        subject: 'Newest',
        receivedAt: '2026-10-21T10:00:00Z',
      }) as never,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function LiveUnread() {
      const list = useMessageList(params, true);
      return (
        <MessagesWorkspace
          title="Unread"
          messages={list.messages}
          query={{
            isPending: list.isPending,
            isError: list.isError,
            error: list.error,
            refetch: () => void list.refetch(),
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: () => undefined,
          }}
          showAccountBadge={false}
          emptyTitle="No messages"
          emptyBody="Nothing here"
          scope={{ params, matches: (message) => message.unread }}
        />
      );
    }

    render(
      <QueryClientProvider client={client}>
        <LiveUnread />
      </QueryClientProvider>,
    );

    await screen.findByRole('button', { name: 'Open message from Alice' });
    publishMailEvent('message.new', { messageId: 'm3', accountId: 'acc-1' });

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /Open message from/ });
      expect(buttons[0]).toHaveAccessibleName('Open message from Carol');
      expect(buttons).toHaveLength(2);
    });
  });
});
