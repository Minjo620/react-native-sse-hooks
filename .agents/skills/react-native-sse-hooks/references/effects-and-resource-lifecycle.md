# Effects and resource lifecycle

## Effect ownership

Model each connection Effect as one synchronization process:

1. Build a transport with every connection-affecting value.
2. Install all transport callbacks.
3. Determine the current AppState policy.
4. Open immediately or enter a paused state.
5. Register the AppState listener when background opening is disabled.
6. On cleanup, remove the listener, cancel timers, invalidate the attempt generation, detach XHR callbacks, and abort the XHR.

Cleanup must be synchronous, safe to call more than once, and sufficient for React Strict Mode's setup-cleanup-setup replay.

## Dependencies and callbacks

- Effect dependencies describe values that require a new connection: URL, method, canonical headers, body, credentials, timeout, retry interval, enablement, and background policy.
- Consumer callbacks do not require a new connection. Store the latest committed callbacks separately and invoke them through the transport callbacks.
- Never suppress `react-hooks/exhaustive-deps`. Change the surrounding code until the dependencies express the synchronization process accurately.
- Do not mutate refs during render merely to escape dependencies. Update callback refs in a commit-phase hook compatible with the React peer range.

## Attempts and cleanup races

- Increment an attempt generation before creating each XHR and whenever retiring one.
- Every asynchronous XHR callback must prove that it belongs to the current monotonically increasing generation before doing work. Do not add a second identity token unless generation reuse becomes possible.
- Detach handlers before aborting. React Native implementations may emit late events during or after abort.
- A stale callback must not publish messages, update status, schedule a retry, or clear a newer connection.

## AppState policy and user control

- Default `openWhenBackground` to false: pause outside `active`, abort the current attempt, and resume with a fresh XHR.
- If mounting outside `active`, enter paused state without briefly creating an XHR.
- Preserve `Last-Event-ID` across pause/resume and reconnect attempts.
- Preserve `Last-Event-ID` in one Hook-owned ref when connection options replace the transport. Reset it when URL, method, or body identifies a different logical stream; do not build render-time identity snapshots for public status.
- Keep `open`, `close`, and `reconnect` explicit and stable so callers can override automatic policy.
- Document that replaying a non-idempotent POST stream may be unsafe; the library cannot infer business semantics.

## Retry policy

- Let `onError` and `onClose` return `false` to stop or a non-negative delay to override.
- A server `retry` field updates the transport's reconnection time until another `retry` field or a new logical transport replaces it; a successful request does not reset it.
- If `onClose` throws, propagate the error only after applying the close reason's default policy. A normal EOF still retries and HTTP 204 still stops. If `onError` throws, stop retrying.
- Clamp server and callback delays only to the host timer's representable range; do not expose a policy limit without a demonstrated use case.
- Cancel pending retry timers on close, pause, reconnect, and disposal.
- Preserve the latest error through the waiting state and clear it only after a successful open.
- By default, retry network errors, timeouts, HTTP 408/429, and 5xx responses. Stop on HTTP 204, other HTTP statuses, and parser failures unless a callback supplies an explicit delay.
