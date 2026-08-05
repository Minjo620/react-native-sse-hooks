---
name: react-native-sse-hooks
description: Build, review, debug, benchmark, or refactor this repository's TypeScript SSE parser, XMLHttpRequest transport, React Hook API, React Native AppState behavior, reconnect policy, tests, build, lint, or package metadata. Enforce the repository's function-oriented architecture, React Effect resource ownership, SSE parsing invariants, user-controlled connection lifecycle, and release quality gates whenever work touches src, tests, benchmarks, or package configuration.
---

# React Native SSE Hooks

Preserve a small Hook-first API while keeping protocol parsing, transport ownership, and React synchronization independently testable.

## Work in this order

1. Identify whether the change affects public API, resource lifecycle, parser behavior, performance, or release tooling.
2. Read only the matching references below before editing.
3. State the invariant being changed or preserved.
4. Add or update the lowest-level deterministic test first: parser, then transport, then Hook.
5. Implement the smallest coherent change without speculative abstractions.
6. Run `npm run check`. Also run `npm run benchmark` for parser or buffering performance claims.

## Non-negotiable rules

- Keep the public entry point Hook-first: `useEventSource(url, options?)`; keep connection controls on its result.
- Keep `src/` function-oriented. Prefer pure functions and closure factories; do not introduce classes.
- Keep render pure. Use Effects only to synchronize React with external resources.
- Let one Effect instance own one AppState subscription and one transport. Its cleanup must synchronously and idempotently retire both.
- Install callbacks and listeners before opening the XHR. Never add a timeout to repair setup ordering.
- Prevent callbacks from retired XHR attempts from changing current state; preserve an explicit attempt generation guard.
- Do not reconnect merely because a consumer callback changed. Update callback references at commit time.
- Treat parser correctness as independent of chunk boundaries and cumulative XHR response growth.
- Permit local mutation only inside an owned parser/transport closure when it does not escape and improves clarity or measured hot-path performance.
- Keep React and React Native as peer dependencies. Do not add a runtime dependency without a demonstrated API, correctness, or measured performance benefit.
- Treat benchmark results as evidence, not correctness tests; never weaken protocol behavior for an unmeasured optimization.

## Read the relevant reference

- Public Hook API, module boundaries, functional style, or new abstractions: [architecture-and-api.md](references/architecture-and-api.md)
- Effects, cleanup, reconnect, AppState, callbacks, or manual controls: [effects-and-resource-lifecycle.md](references/effects-and-resource-lifecycle.md)
- Parsing, XHR chunks, buffers, limits, or benchmarks: [parser-and-performance.md](references/parser-and-performance.md)
- Tests, lint, coverage, packaging, CI, or dependency updates: [testing-and-release-gates.md](references/testing-and-release-gates.md)
- Applying or updating external React Skills: [upstream-policy.md](references/upstream-policy.md)
