/** SSE 连接对外暴露的生命周期状态。 */
export type EventSourceStatus =
  'idle' | 'connecting' | 'open' | 'paused' | 'waiting' | 'closed' | 'error';

/**
 * 已完成解析并交付给业务回调的一条 SSE 消息。
 *
 * @typeParam EventName - 服务端自定义事件名的联合类型；未提供 `event` 字段时为 `message`。
 */
export interface EventSourceMessage<EventName extends string = string> {
  /** 多个 `data` 行按 SSE 规范使用换行符连接后的内容。 */
  data: string;
  /** 服务端事件名；空事件名归一化为 `message`。 */
  event: EventName | 'message';
  /** 该消息交付时已提交的事件 ID，可用于后续 `Last-Event-ID` 恢复。 */
  id: string;
}

/** 服务端正常结束流的原因。 */
export type EventSourceCloseReason = 'server-close' | 'no-content';

/** 请求配置、网络、HTTP、超时或 SSE 协议校验失败的统一错误结构。 */
export interface EventSourceError {
  /** 稳定的错误类别，便于业务决定是否重试。 */
  type: 'configuration-error' | 'network-error' | 'http-error' | 'timeout' | 'protocol-error';
  /** 面向日志和诊断的错误说明。 */
  message: string;
  /** HTTP 错误或原生网络回调可提供的状态码。 */
  status?: number | undefined;
  /** 被包装的原始异常值；调用方使用前应先收窄类型。 */
  cause?: unknown;
}

/** SSE 响应通过状态码和 MIME 校验后触发的打开事件。 */
export interface EventSourceOpenEvent {
  /** HTTP 响应状态码；当前成功流要求为 200。 */
  status: number;
  /** 原始 `Content-Type` 响应头。 */
  contentType: string | null;
}

/** 服务端正常结束 SSE 流时触发的关闭事件。 */
export interface EventSourceCloseEvent {
  /** `server-close` 表示正常 EOF，`no-content` 表示 HTTP 204 且默认停止重连。 */
  reason: EventSourceCloseReason;
}

/**
 * 业务回调对下一次重试的决定：`false` 停止，非负毫秒数覆盖间隔，`undefined` 沿用默认策略。
 */
export type EventSourceRetryDecision = number | false | undefined;

/** 传给 React Native `XMLHttpRequest` 的请求选项。 */
export interface EventSourceRequestOptions {
  /** HTTP 方法，默认为 `GET`。 */
  method?: string | undefined;
  /** `Last-Event-ID` 由 transport 根据已提交事件维护，不能通过 headers 覆盖。 */
  headers?: Record<string, string> | undefined;
  /** 请求体；POST 等非幂等流的重放策略应由业务明确决定。 */
  body?: string | undefined;
  /** 是否启用 React Native XHR 的凭据模式，默认为 `false`。 */
  withCredentials?: boolean | undefined;
  /** XHR 超时毫秒数，`0` 表示不设置超时。 */
  timeout?: number | undefined;
}

/** `useEventSource` 的连接策略和业务回调。 */
export interface UseEventSourceOptions<
  EventName extends string = string,
> extends EventSourceRequestOptions {
  /** 默认为 `true`；`false` 只关闭自动启动，稳定的命令 API 仍然可用。 */
  enabled?: boolean | undefined;
  /**
   * 默认为 `false`。React Native 在后台无法可靠感知长连接是否仍然存活，所以默认暂停并在回到 active 后新建 XHR。
   */
  openWhenBackground?: boolean | undefined;
  /** 服务端未发送 `retry` 时使用的初始重连间隔，默认为 1000 ms。 */
  retryInterval?: number | undefined;
  /** 响应通过 HTTP 和 MIME 校验后触发。 */
  onOpen?: ((event: EventSourceOpenEvent) => void) | undefined;
  /** 每条完整、已提交的 SSE 消息触发一次。 */
  onMessage?: ((message: EventSourceMessage<EventName>) => void) | undefined;
  /** 返回 `false` 停止，返回非负毫秒数覆盖下一次重试；异常会保留默认重试策略并继续向外抛出。 */
  onClose?: ((event: EventSourceCloseEvent) => EventSourceRetryDecision) | undefined;
  /** 返回 `false` 停止，返回非负毫秒数覆盖策略；抛出异常会立即停止，避免隐藏业务错误。 */
  onError?: ((error: EventSourceError) => EventSourceRetryDecision) | undefined;
}

/** Hook 返回的可观察状态与稳定连接命令。 */
export interface UseEventSourceResult {
  /** 当前连接生命周期状态。 */
  status: EventSourceStatus;
  /** 最近一次连接错误；成功打开或回到 idle 时清空。 */
  error: EventSourceError | null;
  /** 在 `enabled: false` 时也可手动启动，status 会继续反映真实连接状态。 */
  open: () => void;
  /** 同步退休当前 XHR 或重试计时器，并进入 `closed`。 */
  close: () => void;
  /** 同步退休当前尝试并立即创建新请求。 */
  reconnect: () => void;
}
