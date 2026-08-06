# React Native SSE Hooks

English | [简体中文](./README.zh-CN.md)

A Hook-first Server-Sent Events client for React Native with incremental parsing, explicit connection ownership, AppState recovery, and controllable retry policy.

## Why this package

- Starts the request only after XHR callbacks and parser ownership are established; it adds no artificial initial connection delay.
- Processes only the new suffix of React Native's cumulative `XMLHttpRequest.responseText`.
- Parses LF, CR, CRLF, comments, BOM, multi-line data, event names, IDs, and retry fields independently of chunk boundaries.
- Pauses on `background`/`inactive` and resumes with transport-managed `Last-Event-ID` by default.
- Retires stale XHR generations so callbacks from an older attempt cannot mutate the current connection.
- Exposes stable `open`, `close`, and `reconnect` commands for applications that need manual ownership.
- Ships CJS, ESM, React Native conditional exports, and TypeScript declarations with no runtime dependencies.

## Installation

```bash
npm install react-native-sse-hooks
```

Peer requirements:

```text
react >= 17
react-native >= 0.64
```

This package is implemented in JavaScript/TypeScript and does not add an iOS or Android native module.

## Quick start

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

## Lifecycle ownership

By default, `enabled` is `true` and `openWhenBackground` is `false`:

- The Hook opens after its Effect owns one transport and one AppState listener.
- Leaving the foreground aborts the active XHR or retry timer.
- Returning to `active` creates a new XHR with the last committed event ID.
- Unmount, Strict Mode replay, and semantic option changes retire owned resources synchronously.

Set `enabled: false` when application logic must decide when a connection can start or replay:

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

The command functions are stable. `status` still reports the real lifecycle in manual mode.

## Request and retry policy

```ts
interface UseEventSourceOptions<EventName extends string = string> {
  method?: string; // default: GET
  headers?: Record<string, string>;
  body?: string;
  withCredentials?: boolean; // default: false
  timeout?: number; // default: 0, no XHR timeout
  enabled?: boolean; // default: true
  openWhenBackground?: boolean; // default: false
  retryInterval?: number; // default: 1000 ms
  onOpen?: (event: EventSourceOpenEvent) => void;
  onMessage?: (message: EventSourceMessage<EventName>) => void;
  onClose?: (event: EventSourceCloseEvent) => number | false | undefined;
  onError?: (error: EventSourceError) => number | false | undefined;
}
```

- HTTP `200` with `text/event-stream` opens the stream.
- HTTP `204` closes with `reason: 'no-content'` and stops retrying by default.
- Network errors, timeouts, HTTP `408`, `429`, and `5xx` retry by default.
- Other HTTP failures and protocol failures stop retrying by default.
- Returning `false` from `onClose`/`onError` stops retrying.
- Returning a finite non-negative number overrides the next retry delay.
- A valid server `retry` field updates the default delay for the logical stream.

`Last-Event-ID` is owned by the transport and must not be supplied in `headers`. This prevents an application header from diverging from the parser's last committed cursor.

## Relationship to `react-native-sse`

[`react-native-sse`](https://github.com/binaryminds/react-native-sse) is an established EventSource-style implementation used as this project's comparison baseline. This package focuses on a Hook-owned lifecycle and a separately testable incremental parser.

The packages have one directly observable difference in initial scheduling. `react-native-sse@1.2.1` documents `timeoutBeforeConnection: 500` as its default. This package installs its callbacks before opening XHR and adds no corresponding wait. This removes an artificial scheduling delay; it does **not** mean the native network handshake itself becomes 500 ms faster.

## Measured results

The retained Expo/Hermes production-bundle results below compare processing with `react-native-sse@1.2.1` explicitly configured to a 0 ms initial delay.

| Workload        | Processing throughput | End-to-end total time |
| --------------- | --------------------: | --------------------: |
| LLM delta       |                +7.46% |               +36.08% |
| Tiny chunks     |                +5.13% |               +24.11% |
| Normal stream   |               +22.01% |               +34.58% |
| Large events    |                +9.89% |               +12.15% |
| High throughput |               +14.13% |               +19.21% |

The test environment used an iPhone 17 Pro simulator, iOS 26.5, Expo SDK 57.0.0, React Native 0.86.2, Hermes, Expo Go, and a production `--no-dev --minify` bundle. The three suites contained 234 connections, including 189 measured connections. All event counts, ordering checks, and hashes passed.

The retained Node 24.18.0/V8 parser microbenchmark improved four workloads. The `normal-stream` workload measured approximately 1%–2% slower by median, a difference of 0.154 ms in the fresh retained run. These results are specific to the recorded workloads and runtimes, not universal performance promises.

Read the [methodology](./docs/benchmarks/README.md), [full results](./docs/benchmarks/2026-08-05-results.md), and [raw evidence](./docs/benchmarks/data/2026-08-05/).

## Protocol and compatibility limits

- Parsing follows the relevant event-stream rules in the [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/server-sent-events.html), but this package is not a browser `EventSource` polyfill.
- Requests use the React Native `XMLHttpRequest` subset and therefore follow platform networking behavior.
- POST stream replay can be non-idempotent. Use manual mode when business coordination is required.
- Simulator and Node benchmarks do not establish physical-device networking, energy, thermal, or large-user-scale behavior.

## Development

```bash
npm ci
npm run check
npm run benchmark
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report vulnerabilities through the private process in [SECURITY.md](./SECURITY.md), not through a public Issue.

## License

[MIT](./LICENSE) © 2026 minjo
