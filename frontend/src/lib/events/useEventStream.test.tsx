import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { setStreamStatus, useStreamStatus } from './streamStatus';
import { useEventStream } from './useEventStream';

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, EventListener>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  emit(type: string, data: unknown, lastEventId = ''): void {
    this.listeners.get(type)?.(
      new MessageEvent(type, { data: JSON.stringify(data), lastEventId }),
    );
  }
}

function Harness() {
  useEventStream(true);
  return <span data-testid="status">{useStreamStatus()}</span>;
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { ...result, client };
}

function currentSource(): MockEventSource {
  const source = MockEventSource.instances.at(-1);
  if (!source) throw new Error('no EventSource created');
  return source;
}

describe('useEventStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    setStreamStatus('connecting');
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports connected, retrying, then failed after three failures', () => {
    renderHarness();
    expect(screen.getByTestId('status')).toHaveTextContent('connecting');
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => currentSource().open());
    expect(screen.getByTestId('status')).toHaveTextContent('connected');

    act(() => currentSource().fail());
    expect(screen.getByTestId('status')).toHaveTextContent('retrying');

    act(() => vi.advanceTimersByTime(2_000));
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => currentSource().fail());
    expect(screen.getByTestId('status')).toHaveTextContent('retrying');

    act(() => vi.advanceTimersByTime(4_000));
    expect(MockEventSource.instances).toHaveLength(3);

    act(() => currentSource().fail());
    expect(screen.getByTestId('status')).toHaveTextContent('failed');

    act(() => vi.advanceTimersByTime(60_000));
    expect(MockEventSource.instances).toHaveLength(3);
    expect(MockEventSource.instances.every((source) => source.closed)).toBe(true);
  });

  it('resets the failure count after a successful reconnect', () => {
    renderHarness();
    act(() => currentSource().open());
    act(() => currentSource().fail());
    act(() => vi.advanceTimersByTime(2_000));

    act(() => currentSource().open());
    expect(screen.getByTestId('status')).toHaveTextContent('connected');

    act(() => currentSource().fail());
    expect(screen.getByTestId('status')).toHaveTextContent('retrying');

    act(() => vi.advanceTimersByTime(2_000));
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it('cancels a pending reconnect when the hook unmounts', () => {
    const view = renderHarness();
    act(() => currentSource().fail());
    view.unmount();

    act(() => vi.advanceTimersByTime(60_000));
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('coalesces a burst of mailbox events into one invalidation', () => {
    const { client } = renderHarness();
    act(() => currentSource().open());
    const spy = vi.spyOn(client, 'invalidateQueries');

    act(() => {
      for (let index = 0; index < 50; index += 1) {
        currentSource().emit('mailbox.updated', { mailboxId: 'mb-1', bulk: true });
      }
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_000));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['mailboxes'] });
  });

  it('recalibrates mailbox and task caches when the tab becomes visible', () => {
    const { client } = renderHarness();
    act(() => currentSource().open());
    const spy = vi.spyOn(client, 'invalidateQueries');

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['mailboxes'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tasks'] });
  });
});
