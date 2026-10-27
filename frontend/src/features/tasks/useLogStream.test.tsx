import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogStreamBatch } from './useLogStream';
import { useLogStream } from './useLogStream';

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, (event: MessageEvent) => void>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(): void {}

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  emit(event: string | null, payload: unknown, id: string): void {
    const message = { data: JSON.stringify(payload), lastEventId: id } as MessageEvent;
    if (event === null) {
      this.onmessage?.(message);
      return;
    }
    this.listeners.get(event)?.(message);
  }
}

function Harness({ onBatch }: { onBatch: (batch: LogStreamBatch) => void }) {
  const { status, retry } = useLogStream({ enabled: true, cursor: '1-2', onBatch });
  return (
    <>
      <span data-testid="status">{status}</span>
      <button type="button" onClick={retry}>
        retry
      </button>
    </>
  );
}

function currentSource(): MockEventSource {
  const source = MockEventSource.instances.at(-1);
  if (!source) throw new Error('no EventSource created');
  return source;
}

describe('useLogStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resumes from the snapshot cursor and forwards batches and resets', () => {
    const batches: LogStreamBatch[] = [];
    render(<Harness onBatch={(batch) => batches.push(batch)} />);

    expect(currentSource().url).toContain('/logs/stream?after=1-2');
    expect(screen.getByTestId('status')).toHaveTextContent('connecting');

    act(() => currentSource().open());
    expect(screen.getByTestId('status')).toHaveTextContent('connected');

    act(() =>
      currentSource().emit(null, [{ id: 3, line: 'time=2026-10-28T06:54:28Z level=INFO msg=sync' }], '1-3'),
    );
    act(() => currentSource().emit('reset', { reason: 'cleared' }, '2-0'));

    expect(batches).toEqual([
      { reset: false, entries: [{ id: 3, line: 'time=2026-10-28T06:54:28Z level=INFO msg=sync' }], cursor: '1-3' },
      { reset: true, entries: [], cursor: '2-0' },
    ]);
  });

  it('stops after three failures and reconnects on demand', () => {
    render(<Harness onBatch={() => undefined} />);

    act(() => currentSource().fail());
    expect(screen.getByTestId('status')).toHaveTextContent('retrying');
    act(() => vi.advanceTimersByTime(2_000));
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => currentSource().fail());
    act(() => vi.advanceTimersByTime(4_000));
    expect(MockEventSource.instances).toHaveLength(3);

    act(() => currentSource().fail());
    expect(screen.getByTestId('status')).toHaveTextContent('failed');
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockEventSource.instances).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(MockEventSource.instances).toHaveLength(4);
    expect(currentSource().url).toContain('/logs/stream?after=1-2');
  });

  it('ignores frames that are not log batches', () => {
    const batches: LogStreamBatch[] = [];
    render(<Harness onBatch={(batch) => batches.push(batch)} />);
    act(() => currentSource().emit(null, { unexpected: true }, '1-2'));
    act(() => currentSource().emit(null, [], '1-2'));
    expect(batches).toEqual([]);
  });
});
