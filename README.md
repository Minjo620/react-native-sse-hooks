# React Native SSE Hooks

An experimental, React Native-aware Server-Sent Events hook with incremental parsing, deterministic listener setup, AppState recovery, and controllable retries.

> Local development preview. This package has not been published yet.

## Why

- No artificial `timeoutBeforeConnection`: callbacks exist before the request starts.
- Incremental parsing for React Native's cumulative `XMLHttpRequest.responseText`.
- Pauses in `background`/`inactive` and resumes with `Last-Event-ID` by default.
- Guards every XHR attempt so stale callbacks cannot affect a newer connection.
- Preserves SSE whitespace and handles LF, CR, CRLF, comments, IDs, event names, and retry fields.
- Uses APIs available from React 17 and adapts both modern and legacy React Native AppState cleanup.

## Usage

```tsx
import { useEventSource } from 'react-native-sse-hooks';

function Updates() {
  const source = useEventSource('https://example.com/events', {
    headers: { Authorization: 'Bearer token' },
    onMessage(message) {
      console.log(message.event, message.data);
    },
    onError(error) {
      if (error.status === 401) return false;
      return 2_000;
    },
  });

  // source.status, source.open(), source.close(), source.reconnect()
  return null;
}
```

The default `openWhenBackground: false` means that the active XHR is aborted when React Native leaves the foreground and recreated when it becomes active. The hook preserves `Last-Event-ID` across that replacement. Changing headers or timeout policy also preserves the ID; changing the URL, method, or body starts a new resume scope.

`Last-Event-ID` is owned by the transport and must not be supplied through `headers`; this prevents the request cursor from diverging from the parser's committed cursor.

Set `enabled: false` when the application should own startup and reconnection. `open()`, `close()`, and `reconnect()` remain stable, and `status` continues to report the real manually controlled connection state. This is the safer mode when replaying a non-idempotent POST stream requires business-level coordination.

## Failure and retry policy

- HTTP `200` opens an SSE stream. HTTP `204` closes with `reason: 'no-content'` and stops by default.
- Network errors, timeouts, HTTP `408`, `429`, and `5xx` responses retry by default. Other HTTP and protocol failures stop.
- Returning `false` from `onError` or `onClose` stops. Returning a finite non-negative number overrides the retry delay.
- A valid server `retry` field remains active across successful reconnections for the lifetime of the logical stream.
- `onClose` observes a normal server EOF. Manual close, background pause, and explicit reconnect are commands, not server-close events.
- Exceptions thrown by `onOpen` or `onMessage` propagate as consumer errors without being relabeled as parser failures. Throwing from `onClose` preserves the default close policy before propagating; throwing from `onError` stops retrying.

## Local verification

```sh
npm install
npm run check
npm run benchmark
```
