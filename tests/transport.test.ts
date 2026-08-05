import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransport } from '../src/transport';
import type { EventSourceCloseEvent, EventSourceError } from '../src/types';

class FakeXHR {
  static instances: FakeXHR[] = [];
  static LOADING = 3;
  static DONE = 4;

  readyState = 0;
  status = 0;
  responseText = '';
  timeout = 0;
  withCredentials = true;
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  headers: Record<string, string> = {};
  body: Document | XMLHttpRequestBodyInit | null | undefined;
  openArguments: unknown[] = [];
  contentType: string | null = 'text/event-stream; charset=utf-8';
  aborted = false;

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(...args: unknown[]) {
    this.openArguments = args;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  getResponseHeader(name: string) {
    return name.toLowerCase() === 'content-type' ? this.contentType : null;
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
  }

  emit(text: string, readyState = FakeXHR.LOADING, status = 200) {
    this.responseText = text;
    this.readyState = readyState;
    this.status = status;
    this.onreadystatechange?.();
  }

  fail() {
    this.onerror?.();
  }

  timeOut() {
    this.ontimeout?.();
  }
}

function setup(overrides: Record<string, unknown> = {}) {
  const statuses: string[] = [];
  const messages: unknown[] = [];
  const errors: EventSourceError[] = [];
  const closes: EventSourceCloseEvent[] = [];
  const source = createTransport('https://example.com/events', {
    retryInterval: 100,
    onStatus: status => statuses.push(status),
    onMessage: message => messages.push(message),
    onClose: event => {
      closes.push(event);
      return undefined;
    },
    onError: error => {
      errors.push(error);
      return undefined;
    },
    ...overrides,
  });
  return { source, statuses, messages, errors, closes };
}

describe('transport contract', () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('streams cumulative response text and resumes after EOF with Last-Event-ID', () => {
    const { source, messages, statuses } = setup();
    source.open();
    const first = FakeXHR.instances[0]!;

    first.emit('id: 7\ndata: hel');
    expect(messages).toEqual([]);
    first.emit('id: 7\ndata: hello\n\nretry: 25\n\n', FakeXHR.DONE);

    expect(messages).toEqual([{ data: 'hello', event: 'message', id: '7' }]);
    expect(statuses[statuses.length - 1]).toBe('waiting');
    vi.advanceTimersByTime(25);
    expect(FakeXHR.instances[1]!.headers['Last-Event-ID']).toBe('7');

    const second = FakeXHR.instances[1]!;
    second.emit('id: 9\n\n');
    second.emit('id: 9\n\n', FakeXHR.DONE);
    vi.advanceTimersByTime(24);
    expect(FakeXHR.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeXHR.instances).toHaveLength(3);
    expect(FakeXHR.instances[2]!.headers['Last-Event-ID']).toBe('9');
  });

  it('does not advance Last-Event-ID beyond a message that closes the transport', () => {
    const received: unknown[] = [];
    let close: () => void = () => undefined;
    const configured = setup({
      onMessage: (message: unknown) => {
        received.push(message);
        close();
      },
    });
    const source = configured.source;
    close = source.close;
    source.open();

    FakeXHR.instances[0]!.emit('id: 1\ndata: first\n\nid: 2\ndata: second\n\n');

    expect(received).toEqual([{ data: 'first', event: 'message', id: '1' }]);
    expect(source.getLastEventId()).toBe('1');
  });

  it('ignores empty cumulative updates and rejects a response that shrinks', () => {
    const { source, messages, errors } = setup();
    source.open();
    const request = FakeXHR.instances[0]!;

    request.emit('data: one\n\n');
    request.emit('data: one\n\n');
    expect(messages).toEqual([{ data: 'one', event: 'message', id: '' }]);

    request.emit('data:');
    expect(messages).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      type: 'protocol-error',
      message: 'XHR responseText shrank during an SSE request.',
    });
    expect(request.aborted).toBe(true);
  });

  it('retires old requests and makes close safe to repeat', () => {
    const { source, messages } = setup();
    source.open();
    const stale = FakeXHR.instances[0]!;
    const staleCallback = stale.onreadystatechange;

    source.reconnect();
    stale.responseText = 'data: stale\n\n';
    stale.readyState = FakeXHR.LOADING;
    stale.status = 200;
    staleCallback?.();
    source.close();
    source.close();

    expect(messages).toEqual([]);
    expect(stale.aborted).toBe(true);
    expect(FakeXHR.instances).toHaveLength(2);
  });

  it('applies the default and caller-controlled retry boundaries', () => {
    const unauthorized = setup();
    unauthorized.source.open();
    FakeXHR.instances[0]!.emit('', FakeXHR.DONE, 401);
    vi.runAllTimers();
    expect(FakeXHR.instances).toHaveLength(1);
    expect(unauthorized.errors[0]).toMatchObject({ type: 'http-error', status: 401 });

    const transient = setup();
    transient.source.open();
    FakeXHR.instances[1]!.emit('', FakeXHR.DONE, 500);
    vi.advanceTimersByTime(100);
    expect(FakeXHR.instances).toHaveLength(3);

    const overridden = setup({ onError: () => 20 });
    overridden.source.open();
    FakeXHR.instances[3]!.fail();
    vi.advanceTimersByTime(19);
    expect(FakeXHR.instances).toHaveLength(4);
    vi.advanceTimersByTime(1);
    expect(FakeXHR.instances).toHaveLength(5);

    const timedOut = setup();
    timedOut.source.open();
    FakeXHR.instances[5]!.timeOut();
    expect(timedOut.errors[0]).toMatchObject({ type: 'timeout' });
    vi.advanceTimersByTime(100);
    expect(FakeXHR.instances).toHaveLength(7);
  });

  it('preserves the default close policy when onClose throws', () => {
    const failure = new Error('close callback failed');
    const { source, statuses } = setup({
      onClose: () => {
        throw failure;
      },
    });
    source.open();

    expect(() => FakeXHR.instances[0]!.emit('', FakeXHR.DONE)).toThrow(failure);
    expect(statuses[statuses.length - 1]).toBe('waiting');
    vi.advanceTimersByTime(99);
    expect(FakeXHR.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeXHR.instances).toHaveLength(2);

    const noContent = setup({
      onClose: () => {
        throw failure;
      },
    });
    noContent.source.open();
    expect(() => FakeXHR.instances[2]!.emit('', FakeXHR.DONE, 204)).toThrow(failure);
    expect(noContent.statuses[noContent.statuses.length - 1]).toBe('closed');
    vi.runAllTimers();
    expect(FakeXHR.instances).toHaveLength(3);
  });

  it('keeps consumer callback failures outside protocol state', () => {
    const openFailure = new Error('open callback failed');
    const opened = setup({
      onOpen: () => {
        throw openFailure;
      },
    });
    opened.source.open();
    expect(() => FakeXHR.instances[0]!.emit('data: delivered\n\n')).toThrow(openFailure);
    expect(opened.messages).toEqual([{ data: 'delivered', event: 'message', id: '' }]);
    expect(opened.statuses[opened.statuses.length - 1]).toBe('open');

    const messageFailure = new Error('message callback failed');
    const onMessage = vi.fn(() => {
      throw messageFailure;
    });
    const messaged = setup({ onMessage });
    messaged.source.open();
    expect(() => FakeXHR.instances[1]!.emit('data: first\n\ndata: second\n\n')).toThrow(
      messageFailure,
    );
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(messaged.errors).toEqual([]);
    expect(messaged.statuses[messaged.statuses.length - 1]).toBe('open');
  });

  it('treats HTTP 204 and invalid MIME as terminal protocol outcomes', () => {
    const noContent = setup();
    noContent.source.open();
    FakeXHR.instances[0]!.emit('', FakeXHR.DONE, 204);
    expect(noContent.closes).toEqual([{ reason: 'no-content' }]);

    const invalid = setup();
    invalid.source.open();
    FakeXHR.instances[1]!.contentType = 'text/event-streaming';
    FakeXHR.instances[1]!.emit('{}');
    expect(invalid.errors[0]).toMatchObject({ type: 'protocol-error' });
    expect(FakeXHR.instances[1]!.aborted).toBe(true);

    vi.runAllTimers();
    expect(FakeXHR.instances).toHaveLength(2);
  });

  it('cancels pending work while paused and creates a fresh request on resume', () => {
    const { source } = setup();
    source.open();
    FakeXHR.instances[0]!.emit('', FakeXHR.DONE);
    source.pause();
    vi.runAllTimers();
    expect(FakeXHR.instances).toHaveLength(1);

    source.resume();
    expect(FakeXHR.instances).toHaveLength(2);

    const paused = setup();
    paused.source.open(true);
    expect(FakeXHR.instances).toHaveLength(2);
    paused.source.resume();
    expect(FakeXHR.instances).toHaveLength(3);
  });

  it('forms the XHR request without duplicating caller headers', () => {
    const { source } = setup({
      method: 'POST',
      body: 'payload',
      headers: { accept: 'text/event-stream; custom=true' },
      timeout: 123,
      withCredentials: false,
    });
    source.open();

    const request = FakeXHR.instances[0]!;
    expect(request.openArguments).toEqual(['POST', 'https://example.com/events', true]);
    expect(request.headers).toEqual({ accept: 'text/event-stream; custom=true' });
    expect(request.body).toBe('payload');
    expect(request.timeout).toBe(123);
    expect(request.withCredentials).toBe(false);

    expect(() => setup({ headers: { 'Last-Event-ID': 'manual' } })).toThrow(
      'Last-Event-ID is managed by the transport',
    );
  });
});
