# React Native SSE Hooks

[English](./README.md) | 简体中文

面向 React Native 的 Hook-first Server-Sent Events 客户端，提供增量解析、明确的连接资源所有权、AppState 恢复和可控重试策略。

## 为什么使用这个包

- 先建立 XHR 回调和 parser 所有权，再启动请求；不增加人为的初始建联等待。
- 针对 React Native 累计增长的 `XMLHttpRequest.responseText`，只处理新增后缀。
- 正确处理 LF、CR、CRLF、注释、BOM、多行 data、事件名、ID 和 retry，结果不依赖 chunk 边界。
- 默认在 `background`/`inactive` 暂停，回到前台后使用 transport 管理的 `Last-Event-ID` 恢复。
- 使用 XHR generation 退休旧尝试，避免迟到回调修改当前连接。
- 提供稳定的 `open`、`close` 和 `reconnect`，便于业务接管连接时机。
- 同时提供 CJS、ESM、React Native 条件导出和 TypeScript 类型，运行时依赖为零。

## 安装

```bash
npm install react-native-sse-hooks
```

Peer 版本要求：

```text
react >= 17
react-native >= 0.64
```

本包由 JavaScript/TypeScript 实现，不增加 iOS 或 Android 原生模块。

## 快速使用

```tsx
import { Text } from 'react-native';
import { useEventSource } from 'react-native-sse-hooks';

export function Updates() {
  const source = useEventSource<'token'>('https://example.com/events', {
    headers: { Authorization: 'Bearer example-token' },
    onMessage(message) {
      console.log(message.event, message.id, message.data);
    },
    onError(error) {
      if (error.status === 401) return false;
      return 2_000;
    },
  });

  return <Text>{source.status}</Text>;
}
```

## 生命周期所有权

默认 `enabled: true`、`openWhenBackground: false`：

- Effect 拥有一个 transport 和一个 AppState listener 后才启动连接。
- App 离开前台时中止当前 XHR 或重试计时器。
- 回到 `active` 后，使用最后提交的事件 ID 创建新 XHR。
- 卸载、Strict Mode replay 或连接语义配置变化时，同步退休已有资源。

需要由业务决定何时连接或重放时，设置 `enabled: false`：

```tsx
const source = useEventSource(url, {
  enabled: false,
  method: 'POST',
  body: JSON.stringify(payload),
  onMessage,
});

source.open();
source.reconnect();
source.close();
```

命令函数保持稳定，手动模式下 `status` 仍反映真实生命周期。

## 请求与重试策略

```ts
interface UseEventSourceOptions<EventName extends string = string> {
  method?: string; // 默认 GET
  headers?: Record<string, string>;
  body?: string;
  withCredentials?: boolean; // 默认 false
  timeout?: number; // 默认 0，不设置 XHR 超时
  enabled?: boolean; // 默认 true
  openWhenBackground?: boolean; // 默认 false
  retryInterval?: number; // 默认 1000 ms
  onOpen?: (event: EventSourceOpenEvent) => void;
  onMessage?: (message: EventSourceMessage<EventName>) => void;
  onClose?: (event: EventSourceCloseEvent) => number | false | undefined;
  onError?: (error: EventSourceError) => number | false | undefined;
}
```

- HTTP `200` 且 MIME 为 `text/event-stream` 时打开流。
- HTTP `204` 以 `reason: 'no-content'` 关闭，默认停止重试。
- 网络错误、超时、HTTP `408`、`429` 和 `5xx` 默认重试。
- 其他 HTTP 错误和协议错误默认停止重试。
- `onClose`/`onError` 返回 `false` 可停止重试。
- 返回有限的非负毫秒数可覆盖下一次重试间隔。
- 有效的服务端 `retry` 字段会更新当前逻辑流的默认间隔。

`Last-Event-ID` 由 transport 管理，不能在 `headers` 中提供，避免业务 Header 与 parser 已提交游标发生分歧。

## 与 `react-native-sse` 的关系

[`react-native-sse`](https://github.com/binaryminds/react-native-sse) 是成熟的 EventSource 风格实现，也是本项目的对标基线。本包聚焦 Hook 所有的连接生命周期，以及可以独立测试的增量 parser。

两者有一个可以直接验证的初始调度差异。`react-native-sse@1.2.1` 文档中的 `timeoutBeforeConnection` 默认值为 500 ms。本包在打开 XHR 前安装回调，不增加对应等待。这里减少的是人为调度延迟，**不代表原生网络握手本身快了 500 ms**。

## 实测结果

下面的 Expo/Hermes production bundle 结果，在处理性能上与显式设置为 0 ms 初始等待的 `react-native-sse@1.2.1` 比较。

| Workload        | 处理吞吐 | 端到端总耗时 |
| --------------- | -------: | -----------: |
| LLM delta       |   +7.46% |      +36.08% |
| Tiny chunks     |   +5.13% |      +24.11% |
| Normal stream   |  +22.01% |      +34.58% |
| Large events    |   +9.89% |      +12.15% |
| High throughput |  +14.13% |      +19.21% |

测试环境包括 iPhone 17 Pro 模拟器、iOS 26.5、Expo SDK 57.0.0、React Native 0.86.2、Hermes、Expo Go 和 production `--no-dev --minify` bundle。三个 suite 共运行 234 次连接，其中 189 次计入测量。事件数量、顺序和 Hash 检查全部通过。

最终保留的 Node 24.18.0/V8 parser 微基准中，四个 workload 有所提升。`normal-stream` median 约慢 1%～2%，fresh retained run 相差 0.154 ms。这些结果只适用于记录中的 workload 和 runtime，不构成普遍性能承诺。

查看完整的 [测试方法](./docs/benchmarks/README.zh-CN.md)、[结果](./docs/benchmarks/2026-08-05-results.md) 和 [原始证据](./docs/benchmarks/data/2026-08-05/)。

## 协议和兼容性边界

- Parser 遵循 [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/server-sent-events.html) 中相关的 event-stream 规则，但本包不是浏览器 `EventSource` polyfill。
- 请求基于 React Native 的 `XMLHttpRequest` 子集，网络行为受平台实现影响。
- POST 流重放可能不是幂等操作。需要业务协调时，请使用手动模式。
- 模拟器和 Node benchmark 不能证明物理设备网络、功耗、温度或大规模用户表现。

## 本地开发

```bash
npm ci
npm run check
npm run benchmark
```

提交 PR 前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。安全问题请通过 [SECURITY.md](./SECURITY.md) 中的私密渠道报告，不要公开提交 Issue。

## License

[MIT](./LICENSE) © 2026 minjo
