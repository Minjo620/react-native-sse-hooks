import { createParser, type ParserEvent } from './parser';
import type {
  EventSourceCloseEvent,
  EventSourceError,
  EventSourceMessage,
  EventSourceOpenEvent,
  EventSourceRequestOptions,
  EventSourceRetryDecision,
  EventSourceStatus,
} from './types';

const MAX_TIMER_DELAY = 2_147_483_647;

interface TransportOptions<EventName extends string> extends EventSourceRequestOptions {
  initialLastEventId?: string | undefined;
  retryInterval: number;
  onStatus: (status: EventSourceStatus) => void;
  onOpen?: ((event: EventSourceOpenEvent) => void) | undefined;
  onMessage?: ((message: EventSourceMessage<EventName>) => void) | undefined;
  onClose: (event: EventSourceCloseEvent) => EventSourceRetryDecision;
  onError: (error: EventSourceError) => EventSourceRetryDecision;
}

/** Hook 内部使用的连接资源控制面；不属于包的公共入口。 */
export interface Transport {
  /** 启动连接；`startPaused` 用于 App 初始不在前台的场景。 */
  open: (startPaused?: boolean) => void;
  /** 退休资源并回到未启用的 `idle` 状态。 */
  deactivate: () => void;
  /** 退休资源并进入 `closed`，不会触发服务端关闭回调。 */
  close: () => void;
  /** 退休当前尝试并立即创建新请求。 */
  reconnect: () => void;
  /** 退休当前 XHR/计时器并保存恢复游标。 */
  pause: () => void;
  /** 仅在 paused 状态创建新请求。 */
  resume: () => void;
  /** Effect cleanup 使用的幂等资源释放，不再发布状态。 */
  dispose: () => void;
  /** 返回最近一次完整消费后提交的事件 ID。 */
  getLastEventId: () => string;
}

type Completion =
  | { type: 'close'; event: EventSourceCloseEvent; retry: boolean }
  | { type: 'error'; error: EventSourceError; retry: boolean };

interface Request {
  start: () => void;
  abort: () => void;
}

interface RequestOptions extends EventSourceRequestOptions {
  url: string;
  lastEventId: string;
  onOpen: (event: EventSourceOpenEvent) => Error | undefined;
  onEvents: (events: ParserEvent[], finalLastEventId: string) => Error | undefined;
  onComplete: (completion: Completion) => Error | undefined;
}

type Phase =
  | { type: 'closed' }
  | { type: 'paused' }
  | { type: 'request'; generation: number; request: Request }
  | { type: 'waiting'; timer: ReturnType<typeof setTimeout> };

function asError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  const error = new Error('An SSE consumer callback threw a non-Error value.');
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function validateDelay(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
  return Math.min(value, MAX_TIMER_DELAY);
}

function retriesByDefault(error: EventSourceError): boolean {
  if (error.type === 'network-error' || error.type === 'timeout') return true;
  const status = error.status ?? 0;
  return (
    error.type === 'http-error' &&
    (status === 408 || status === 429 || (status >= 500 && status <= 599))
  );
}

function isEventStream(contentType: string | null): boolean {
  const [essence] = contentType?.split(';', 1) ?? [];
  return essence?.trim().toLowerCase() === 'text/event-stream';
}

function detach(xhr: XMLHttpRequest): void {
  xhr.onreadystatechange = null;
  xhr.onerror = null;
  xhr.ontimeout = null;
}

function hasHeader(headers: Record<string, string> | undefined, name: string): boolean {
  return Object.keys(headers ?? {}).some(header => header.toLowerCase() === name.toLowerCase());
}

function headersFor(
  source: Record<string, string> | undefined,
  lastEventId: string,
): Record<string, string> {
  const headers = { ...source };

  if (!hasHeader(headers, 'accept')) headers.Accept = 'text/event-stream';
  if (lastEventId) headers['Last-Event-ID'] = lastEventId;
  return headers;
}

/**
 * 一次 request 只拥有一个 XHR、一个 parser 和一个累计响应 offset。
 * offset 让累计 `responseText` 只切出新增后缀，避免重复解析已经消费的数据。
 */
function createRequest(options: RequestOptions): Request {
  const xhr = new XMLHttpRequest();
  const parser = createParser(options.lastEventId);
  let active = true;
  let opened = false;
  let offset = 0;
  const isActive = () => active;

  function finish(completion: Completion, abort = false): Error | undefined {
    if (!active) return undefined;
    active = false;
    detach(xhr);
    if (abort) xhr.abort();
    return options.onComplete(completion);
  }

  function read(): {
    open: EventSourceOpenEvent | null;
    events: ParserEvent[];
    finalLastEventId: string;
  } {
    let open: EventSourceOpenEvent | null = null;
    if (!opened) {
      const contentType = xhr.getResponseHeader('content-type');
      if (!isEventStream(contentType)) {
        throw new Error(
          `Expected content-type text/event-stream, received ${contentType ?? 'none'}.`,
        );
      }
      opened = true;
      open = { status: xhr.status, contentType };
    }

    const response = xhr.responseText || '';
    if (response.length < offset) {
      throw new Error('XHR responseText shrank during an SSE request.');
    }
    // React Native LOADING 阶段的 responseText 会累计增长；这里只把新增后缀交给 parser。
    const events = parser.push(response.slice(offset));
    offset = response.length;
    if (xhr.readyState === XMLHttpRequest.DONE) events.push(...parser.finish());
    return { open, events, finalLastEventId: parser.getLastEventId() };
  }

  function failProtocol(cause: unknown): void {
    const failure = finish(
      {
        type: 'error',
        error: {
          type: 'protocol-error',
          message: cause instanceof Error ? cause.message : 'Invalid SSE response.',
          cause,
        },
        retry: false,
      },
      true,
    );
    if (failure) throw failure;
  }

  function handleReadyStateChange(): void {
    if (!active) return;
    if (xhr.readyState !== XMLHttpRequest.LOADING && xhr.readyState !== XMLHttpRequest.DONE) return;

    if (xhr.status === 204 && xhr.readyState === XMLHttpRequest.DONE) {
      const failure = finish({
        type: 'close',
        event: { reason: 'no-content' },
        retry: false,
      });
      if (failure) throw failure;
      return;
    }

    if (xhr.status !== 200) {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        const error: EventSourceError =
          xhr.status === 0
            ? {
                type: 'network-error',
                message: 'The SSE request ended without an HTTP response.',
              }
            : {
                type: 'http-error',
                message: `SSE request failed with HTTP ${xhr.status}.`,
                status: xhr.status,
              };
        const failure = finish({ type: 'error', error, retry: retriesByDefault(error) });
        if (failure) throw failure;
      }
      return;
    }

    let update: ReturnType<typeof read>;
    try {
      update = read();
    } catch (cause) {
      failProtocol(cause);
      return;
    }

    const openFailure = update.open ? options.onOpen(update.open) : undefined;
    const eventFailure = isActive()
      ? options.onEvents(update.events, update.finalLastEventId)
      : undefined;
    const closeFailure =
      isActive() && xhr.readyState === XMLHttpRequest.DONE
        ? finish({
            type: 'close',
            event: { reason: 'server-close' },
            retry: true,
          })
        : undefined;
    const failure = openFailure ?? eventFailure ?? closeFailure;
    if (failure) throw failure;
  }

  function fail(error: EventSourceError, abort = false): void {
    const failure = finish({ type: 'error', error, retry: retriesByDefault(error) }, abort);
    if (failure) throw failure;
  }

  // 所有回调都在 open/send 前安装，建联不需要额外等待来修复监听器顺序。
  xhr.onreadystatechange = handleReadyStateChange;
  xhr.onerror = () => {
    fail({
      type: 'network-error',
      message: 'The SSE network request failed.',
      status: xhr.status || undefined,
    });
  };
  xhr.ontimeout = () => {
    fail({
      type: 'timeout',
      message: 'The SSE request timed out.',
    });
  };

  function start(): void {
    try {
      xhr.open(options.method ?? 'GET', options.url, true);
      xhr.withCredentials = options.withCredentials ?? false;
      xhr.timeout = options.timeout ?? 0;
      for (const [name, value] of Object.entries(
        headersFor(options.headers, options.lastEventId),
      )) {
        xhr.setRequestHeader(name, value);
      }
      xhr.send(options.body);
    } catch (cause) {
      if (!active) throw asError(cause);
      fail(
        {
          type: 'configuration-error',
          message: cause instanceof Error ? cause.message : 'Failed to configure SSE request.',
          cause,
        },
        true,
      );
    }
  }

  function abort(): void {
    if (!active) return;
    active = false;
    detach(xhr);
    xhr.abort();
  }

  return { start, abort };
}

/**
 * transport 用一个互斥 phase 表达资源所有权，因此任意时刻最多只有一条 XHR 或一个 timer。
 * generation 只负责否决 native 层迟到的旧回调，不参与业务状态表达。
 *
 * @param url - 当前逻辑流的固定请求地址。
 * @param options - 请求参数、初始恢复游标、重试策略和回调。
 * @returns 由一个 React Effect 独占并在 cleanup 时释放的 transport。
 */
export function createTransport<EventName extends string = string>(
  url: string,
  options: TransportOptions<EventName>,
): Transport {
  if (hasHeader(options.headers, 'last-event-id')) {
    throw new TypeError('Last-Event-ID is managed by the transport.');
  }

  let phase: Phase = { type: 'closed' };
  let generation = 0;
  let retryInterval = validateDelay(options.retryInterval, 'retryInterval');
  let lastEventId = options.initialLastEventId ?? '';

  function retire(): void {
    generation += 1;
    const current = phase;
    phase = { type: 'closed' };
    if (current.type === 'waiting') clearTimeout(current.timer);
    if (current.type === 'request') current.request.abort();
  }

  function schedule(delay: number): void {
    const timer = setTimeout(() => {
      if (phase.type !== 'waiting' || phase.timer !== timer) return;
      phase = { type: 'closed' };
      startRequest();
    }, delay);
    phase = { type: 'waiting', timer };
    options.onStatus('waiting');
  }

  function resolveRetry(decision: EventSourceRetryDecision, retry: boolean): number | null {
    if (decision === false) return null;
    if (typeof decision === 'number') return validateDelay(decision, 'Retry callback result');
    return retry ? retryInterval : null;
  }

  function settle(delay: number | null, completion: Completion): void {
    if (delay === null) {
      if (completion.type === 'close') options.onStatus('closed');
    } else {
      schedule(delay);
    }
  }

  function complete(currentGeneration: number, completion: Completion): Error | undefined {
    if (phase.type !== 'request' || phase.generation !== currentGeneration) return undefined;
    phase = { type: 'closed' };

    let decision: EventSourceRetryDecision;
    try {
      decision =
        completion.type === 'error'
          ? options.onError(completion.error)
          : options.onClose(completion.event);
    } catch (cause) {
      const failure = asError(cause);
      if (generation !== currentGeneration) return failure;

      if (completion.type === 'close') {
        settle(completion.retry ? retryInterval : null, completion);
      } else {
        generation += 1;
      }
      return failure;
    }

    if (generation !== currentGeneration) return undefined;

    let delay: number | null;
    try {
      delay = resolveRetry(decision, completion.retry);
    } catch (cause) {
      generation += 1;
      settle(null, completion);
      return asError(cause);
    }

    settle(delay, completion);
    return undefined;
  }

  function deliver(
    events: ParserEvent[],
    finalLastEventId: string,
    currentGeneration: number,
  ): Error | undefined {
    let failure: Error | undefined;
    for (const event of events) {
      if (phase.type !== 'request' || phase.generation !== currentGeneration) break;

      if (event.type === 'retry') {
        retryInterval = validateDelay(event.value, 'SSE retry');
      } else {
        // 直接从消息提交 ID，避免为每条消息再分配一个 Last-Event-ID 中间事件。
        lastEventId = event.value.id;
        try {
          options.onMessage?.(event.value as EventSourceMessage<EventName>);
        } catch (cause) {
          failure ??= asError(cause);
        }
      }
    }
    if (phase.type === 'request' && phase.generation === currentGeneration) {
      lastEventId = finalLastEventId;
    }
    return failure;
  }

  function startRequest(): void {
    if (phase.type !== 'closed') return;
    const currentGeneration = ++generation;
    const request = createRequest({
      url,
      body: options.body,
      headers: options.headers,
      lastEventId,
      method: options.method,
      timeout: options.timeout,
      withCredentials: options.withCredentials,
      onOpen: event => {
        if (phase.type !== 'request' || phase.generation !== currentGeneration) return undefined;
        options.onStatus('open');
        try {
          options.onOpen?.(event);
          return undefined;
        } catch (cause) {
          return asError(cause);
        }
      },
      onEvents: (events, finalLastEventId) => deliver(events, finalLastEventId, currentGeneration),
      onComplete: completion => complete(currentGeneration, completion),
    });
    phase = { type: 'request', generation: currentGeneration, request };
    options.onStatus('connecting');
    request.start();
  }

  function open(startPaused = false): void {
    if (phase.type === 'request' || phase.type === 'waiting') return;
    if (startPaused) {
      phase = { type: 'paused' };
      options.onStatus('paused');
    } else {
      phase = { type: 'closed' };
      startRequest();
    }
  }

  function close(): void {
    retire();
    options.onStatus('closed');
  }

  function deactivate(): void {
    retire();
    options.onStatus('idle');
  }

  function reconnect(): void {
    retire();
    startRequest();
  }

  function pause(): void {
    if (phase.type === 'closed' || phase.type === 'paused') return;
    retire();
    phase = { type: 'paused' };
    options.onStatus('paused');
  }

  function resume(): void {
    if (phase.type !== 'paused') return;
    phase = { type: 'closed' };
    startRequest();
  }

  function dispose(): void {
    retire();
  }

  const getLastEventId = () => lastEventId;

  return { open, deactivate, close, reconnect, pause, resume, dispose, getLastEventId };
}
