# Changelog

All notable user-visible changes to this project are documented in this file. Version numbers follow [Semantic Versioning](https://semver.org/).

## 0.1.0 - Unreleased

### Added

- Hook-first `useEventSource(url, options?)` API with stable `open`, `close`, and `reconnect` commands.
- Incremental SSE parsing for cumulative React Native `XMLHttpRequest.responseText`.
- LF, CR, CRLF, BOM, comments, event names, multi-line data, ID, retry, and chunk-boundary handling.
- AppState-aware pause/resume with transport-managed `Last-Event-ID` continuity.
- Explicit retry decisions for normal close, HTTP, network, timeout, and protocol failures.
- Stale XHR generation guards and idempotent cleanup for Strict Mode, unmount, and configuration changes.
- CJS, ESM, React Native conditional exports, and TypeScript declarations.
- Reproducible Node/V8 and Expo/Hermes benchmark evidence with correctness validation and stated limitations.
