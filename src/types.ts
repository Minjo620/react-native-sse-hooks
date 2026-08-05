export type EventSourceStatus =
  'idle' | 'connecting' | 'open' | 'paused' | 'waiting' | 'closed' | 'error';

export interface EventSourceMessage<EventName extends string = string> {
  data: string;
  event: EventName | 'message';
  id: string;
}

export type EventSourceCloseReason = 'server-close' | 'no-content';

export interface EventSourceError {
  type: 'network-error' | 'http-error' | 'timeout' | 'protocol-error';
  message: string;
  status?: number | undefined;
  cause?: unknown;
}

export interface EventSourceOpenEvent {
  status: number;
  contentType: string | null;
}

export interface EventSourceCloseEvent {
  reason: EventSourceCloseReason;
}

export type EventSourceRetryDecision = number | false | undefined;

export interface EventSourceRequestOptions {
  method?: string | undefined;
  /** `Last-Event-ID` 由 transport 根据已提交事件维护，不能通过 headers 覆盖。 */
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
  withCredentials?: boolean | undefined;
  timeout?: number | undefined;
}

export interface UseEventSourceOptions<
  EventName extends string = string,
> extends EventSourceRequestOptions {
  /** `false` 只关闭自动启动，稳定的命令 API 仍然可用，便于业务完全接管连接时机。 */
  enabled?: boolean | undefined;
  /**
   * React Native 在后台无法可靠感知长连接是否仍然存活，所以默认暂停并在回到 active 后新建 XHR。
   */
  openWhenBackground?: boolean | undefined;
  /** 服务端未发送 `retry` 时使用的初始重连间隔。 */
  retryInterval?: number | undefined;
  onOpen?: ((event: EventSourceOpenEvent) => void) | undefined;
  onMessage?: ((message: EventSourceMessage<EventName>) => void) | undefined;
  /** 返回 `false` 停止，返回非负毫秒数覆盖下一次重试；异常会保留默认重试策略并继续向外抛出。 */
  onClose?: ((event: EventSourceCloseEvent) => EventSourceRetryDecision) | undefined;
  /** 返回 `false` 停止，返回非负毫秒数覆盖策略；抛出异常会立即停止，避免隐藏业务错误。 */
  onError?: ((error: EventSourceError) => EventSourceRetryDecision) | undefined;
}

export interface UseEventSourceResult {
  status: EventSourceStatus;
  error: EventSourceError | null;
  /** 在 `enabled: false` 时也可手动启动，status 会继续反映真实连接状态。 */
  open: () => void;
  close: () => void;
  reconnect: () => void;
}
