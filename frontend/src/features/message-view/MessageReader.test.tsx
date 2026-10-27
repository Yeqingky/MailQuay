import '@/lib/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schemas } from '@/lib/api/client';
import { fetchMessage, fetchMessageBody, updateMessage } from '@/features/message-list/api';
import { MessageReader } from './MessageReader';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/features/compose/useComposeLauncher', () => ({
  useComposeLauncher: () => ({ launch: vi.fn() }),
}));

vi.mock('@/features/message-list/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/message-list/api')>();
  return {
    ...actual,
    fetchMessage: vi.fn(),
    fetchMessageBody: vi.fn(),
    updateMessage: vi.fn(),
  };
});

const inlineImage: Schemas['Attachment'] = {
  id: 'image-attachment',
  filename: 'diagram.png',
  contentType: 'image/png',
  size: 5,
  disposition: 'inline',
  contentId: 'diagram@example.com',
};

function makeMessage(id: string, unread: boolean): Schemas['MessageDetail'] {
  return {
    id,
    accountId: 'account-1',
    mailboxId: 'inbox-1',
    subject: id === 'image-mail' ? 'Image mail' : 'Other mail',
    from: { name: 'Alice', email: 'alice@example.com' },
    receivedAt: '2026-05-08T10:00:00Z',
    size: 100,
    unread,
    marked: false,
    hasAttachments: id === 'image-mail',
    bodyState: 'cached',
    attachments: id === 'image-mail' ? [inlineImage] : [],
  };
}

const imageMessage = makeMessage('image-mail', true);
const otherMessage = makeMessage('other-mail', false);

function renderReader(selectedId: string, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MessageReader
          key={selectedId}
          messageId={selectedId}
          onCloseMobile={() => undefined}
          onDeleted={() => undefined}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('MessageReader inline images', () => {
  beforeEach(() => {
    vi.mocked(fetchMessage).mockImplementation(async (id) =>
      id === 'image-mail' ? imageMessage : otherMessage,
    );
    vi.mocked(fetchMessageBody).mockImplementation(async (id) =>
      id === 'image-mail'
        ? {
            html: '<img src="cid:diagram@example.com" alt="diagram">',
            text: '',
            remoteImagesBlocked: false,
            attachments: [],
          }
        : {
            html: '<p>Other message body</p>',
            text: 'Other message body',
            remoteImagesBlocked: false,
            attachments: [],
          },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['image'], { type: 'image/png' }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps inline images available after switching away and returning', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const readUpdate = Promise.withResolvers<Schemas['MessageDetail']>();
    vi.mocked(updateMessage).mockReturnValue(readUpdate.promise);
    const view = render(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'data:image/png;base64,',
      );
    });

    view.rerender(renderReader('other-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'Other message body',
      );
    });

    await act(async () => {
      readUpdate.resolve({ ...imageMessage, unread: false, attachments: [] });
    });

    view.rerender(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'data:image/png;base64,',
      );
    });
  });

  it('uses body attachment metadata when message details contain none', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    vi.mocked(fetchMessage).mockResolvedValue({
      ...imageMessage,
      unread: false,
      attachments: [],
    });
    vi.mocked(fetchMessageBody).mockResolvedValue({
      html: '<img src="cid:diagram@example.com" alt="diagram">',
      text: '',
      remoteImagesBlocked: false,
      attachments: [inlineImage],
    });

    render(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'data:image/png;base64,',
      );
    });
  });
});

describe('MessageReader body fallback', () => {
  it('renders plain text when the HTML sanitizer removes all content', async () => {
    vi.mocked(fetchMessage).mockResolvedValue(otherMessage);
    vi.mocked(fetchMessageBody).mockResolvedValue({
      html: '<script>document.write("unsafe mail markup")</script>',
      text: 'Readable plain-text body',
      remoteImagesBlocked: false,
      attachments: [],
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    render(renderReader('other-mail', client));

    await waitFor(() => {
      const srcdoc = document.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
      expect(srcdoc).toContain('Readable plain-text body');
      expect(srcdoc).not.toContain('<script');
    });
  });
});

describe('MessageReader remote image banner', () => {
  it('shows the load button with the first rendered blocked body', async () => {
    vi.mocked(fetchMessage).mockResolvedValue(otherMessage);
    vi.mocked(fetchMessageBody).mockResolvedValue({
      html: '<p>mail</p><img src="https://images.example/a.png" width="80" height="80">',
      text: 'mail',
      remoteImagesBlocked: true,
      attachments: [],
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    render(renderReader('other-mail', client));

    await waitFor(() => {
      const srcdoc = document.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
      expect(srcdoc).toContain('data-blocked-src="https://images.example/a.png"');
    });
    expect(
      screen.getByRole('button', { name: /load images from this sender|加载此发件人的图片/i }),
    ).toBeInTheDocument();
  });
});

describe('MessageReader consent', () => {
  afterEach(() => {
    localStorage.removeItem('mailquay:remote-image-senders');
    vi.clearAllMocks();
  });

  it('renders allowed images on the first frame for a consented sender', async () => {
    localStorage.setItem(
      'mailquay:remote-image-senders',
      JSON.stringify(['alice@example.com']),
    );
    vi.mocked(fetchMessage).mockResolvedValue(otherMessage);
    vi.mocked(fetchMessageBody).mockResolvedValue({
      html: '<p>mail</p><img src="https://images.example/a.png" width="80" height="80">',
      text: 'mail',
      remoteImagesBlocked: true,
      attachments: [],
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    render(renderReader('other-mail', client));

    await waitFor(() => {
      const srcdoc = document.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
      expect(srcdoc).toContain('src="https://images.example/a.png"');
      expect(srcdoc).not.toContain('data-blocked-src="');
    });
    expect(
      screen.queryByRole('button', { name: /load images from this sender|加载此发件人的图片/i }),
    ).not.toBeInTheDocument();
  });
});

describe('MessageReader cached content', () => {
  beforeEach(() => {
    vi.mocked(updateMessage).mockResolvedValue({ ...imageMessage, unread: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['image'], { type: 'image/png' }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps the cached body when the background refetch fails', async () => {
    vi.mocked(fetchMessage).mockImplementation(async (id) =>
      id === 'image-mail' ? imageMessage : otherMessage,
    );
    const body = {
      html: '<img src="cid:diagram@example.com" alt="diagram">',
      text: '',
      remoteImagesBlocked: false,
      attachments: [],
    };
    let bodyCalls = 0;
    vi.mocked(fetchMessageBody).mockImplementation(async (id) => {
      if (id !== 'image-mail') {
        return {
          html: '<p>Other message body</p>',
          text: 'Other message body',
          remoteImagesBlocked: false,
          attachments: [],
        };
      }
      bodyCalls += 1;
      if (bodyCalls > 1) throw new Error('body refresh failed');
      return body;
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    const view = render(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'data:image/png;base64,',
      );
    });

    view.rerender(renderReader('other-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'Other message body',
      );
    });

    view.rerender(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'data:image/png;base64,',
      );
    });
  });

  it('keeps the cached message when the detail refetch fails', async () => {
    let detailCalls = 0;
    vi.mocked(fetchMessage).mockImplementation(async (id) => {
      if (id !== 'image-mail') return otherMessage;
      detailCalls += 1;
      if (detailCalls > 1) throw new Error('detail refresh failed');
      return imageMessage;
    });
    vi.mocked(fetchMessageBody).mockImplementation(async (id) => ({
      html: id === 'image-mail' ? '<p>Image message body</p>' : '<p>Other message body</p>',
      text: id === 'image-mail' ? 'Image message body' : 'Other message body',
      remoteImagesBlocked: false,
      attachments: id === 'image-mail' ? [inlineImage] : [],
    }));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    const view = render(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'Image message body',
      );
    });

    view.rerender(renderReader('other-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'Other message body',
      );
    });

    view.rerender(renderReader('image-mail', client));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
        'Image message body',
      );
    });
  });
});
