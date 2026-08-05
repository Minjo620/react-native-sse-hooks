import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { createTransport, type Transport } from './transport';
import type {
  EventSourceError,
  EventSourceStatus,
  UseEventSourceOptions,
  UseEventSourceResult,
} from './types';

const DEFAULT_RETRY_INTERVAL = 1_000;

type ConsumerCallbacks<EventName extends string> = Pick<
  UseEventSourceOptions<EventName>,
  'onOpen' | 'onMessage' | 'onClose' | 'onError'
>;

interface ConnectionState {
  status: EventSourceStatus;
  error: EventSourceError | null;
}

function snapshotHeaders(headers: Record<string, string> | undefined): string {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    normalized[name.toLowerCase()] = value;
  }
  return JSON.stringify(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function restoreHeaders(snapshot: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of JSON.parse(snapshot) as [string, string][]) {
    headers[name] = value;
  }
  return headers;
}

function subscribeToAppState(listener: (state: AppStateStatus) => void): () => void {
  const subscription = AppState.addEventListener('change', listener) as
    { remove?: (() => void) | undefined } | undefined;

  return () => {
    if (subscription?.remove) {
      subscription.remove();
      return;
    }

    const legacy = AppState as typeof AppState & {
      removeEventListener?: (event: 'change', callback: (state: AppStateStatus) => void) => void;
    };
    legacy.removeEventListener?.('change', listener);
  };
}

/** 回调只在 commit 后更新，因此 render 被放弃时不会提前影响仍在工作的 transport。 */
function useCommittedCallbacks<EventName extends string>(
  options: UseEventSourceOptions<EventName>,
): React.RefObject<ConsumerCallbacks<EventName>> {
  const ref = useRef<ConsumerCallbacks<EventName>>({
    onClose: options.onClose,
    onError: options.onError,
    onMessage: options.onMessage,
    onOpen: options.onOpen,
  });
  useLayoutEffect(() => {
    ref.current = {
      onClose: options.onClose,
      onError: options.onError,
      onMessage: options.onMessage,
      onOpen: options.onOpen,
    };
  }, [options.onClose, options.onError, options.onMessage, options.onOpen]);
  return ref;
}

/**
 * 一个 Effect 完整拥有一个 transport 和一个可选的 AppState listener；cleanup 同步退休二者，
 * 因而 StrictMode replay、配置变化和卸载都遵循同一条资源路径。
 *
 * @typeParam EventName - 服务端自定义事件名的联合类型。
 * @param url - SSE 请求地址；URL、method 或 body 改变时会开始新的恢复范围。
 * @param options - 请求参数、连接策略和业务回调。
 * @returns 当前状态、最近错误以及稳定的打开、关闭和重连命令。
 */
export function useEventSource<EventName extends string = string>(
  url: string,
  options: UseEventSourceOptions<EventName> = {},
): UseEventSourceResult {
  const {
    body,
    enabled = true,
    method,
    openWhenBackground = false,
    retryInterval = DEFAULT_RETRY_INTERVAL,
    timeout,
    withCredentials,
  } = options;

  const callbacks = useCommittedCallbacks(options);
  const headers = snapshotHeaders(options.headers);
  const stream = JSON.stringify([url, method?.toUpperCase() ?? 'GET', body ?? null]);
  const resume = useRef({ stream, lastEventId: '' });
  const transport = useRef<Transport | null>(null);
  const [state, setState] = useState<ConnectionState>({
    status: enabled ? 'connecting' : 'idle',
    error: null,
  });

  useEffect(() => {
    if (resume.current.stream !== stream) resume.current = { stream, lastEventId: '' };

    const connection = createTransport<EventName>(url, {
      body,
      headers: restoreHeaders(headers),
      initialLastEventId: resume.current.lastEventId,
      method,
      retryInterval,
      timeout,
      withCredentials,
      onStatus: status => {
        setState(current => ({
          status,
          error: status === 'open' || status === 'idle' ? null : current.error,
        }));
      },
      onOpen: event => callbacks.current.onOpen?.(event),
      onMessage: message => callbacks.current.onMessage?.(message),
      onClose: event => callbacks.current.onClose?.(event),
      onError: error => {
        setState({ status: 'error', error });
        return callbacks.current.onError?.(error);
      },
    });

    transport.current = connection;

    const startsPaused = !openWhenBackground && AppState.currentState !== 'active';
    const unsubscribe = openWhenBackground
      ? undefined
      : subscribeToAppState(nextState => {
          if (nextState === 'active') connection.resume();
          else connection.pause();
        });

    if (enabled) connection.open(startsPaused);
    else connection.deactivate();

    return () => {
      unsubscribe?.();
      resume.current = { stream, lastEventId: connection.getLastEventId() };
      connection.dispose();
      if (transport.current === connection) transport.current = null;
    };
  }, [
    body,
    callbacks,
    enabled,
    headers,
    method,
    openWhenBackground,
    retryInterval,
    stream,
    timeout,
    url,
    withCredentials,
  ]);

  const open = useCallback(() => transport.current?.open(), []);
  const close = useCallback(() => transport.current?.close(), []);
  const reconnect = useCallback(() => transport.current?.reconnect(), []);

  return { ...state, open, close, reconnect };
}
