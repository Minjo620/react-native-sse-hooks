# Architecture and API

## Public surface

- Keep the primary signature `useEventSource(url, options?)`. The URL is required; all policy and callbacks remain optional in the second argument.
- Return observable state plus stable `open`, `close`, and `reconnect` commands. Do not require consumers to construct a client, parser, scheduler, or provider.
- Prefer one obvious default behavior. Add an option only when callers need a durable policy choice, not to patch an internal race.
- Keep protocol and transport implementation details out of exported types.

## Functional core and imperative shell

- Use pure transformations where output can be derived from input without owning a resource.
- Use closure factories for stateful protocol and transport processes. Their mutable state must be private, have one owner, and become unreachable after disposal.
- Keep React Native integration at the Hook edge. Parser code must not import React or React Native.
- Keep XHR and timers inside the transport boundary. Do not expose them through the Hook result.
- Prefer a cohesive deep module over many one-line helpers. Extract only when the name exposes a real concept, the code is reused, or the boundary becomes independently testable.

## Current module ownership

- `parser.ts` owns one response's protocol buffers and returns parsed protocol events as values.
- `transport.ts` owns XHR attempts, the mutually exclusive connection phase, Last-Event-ID, and the retry timer.
- `useEventSource.ts` synchronizes one transport and one AppState subscription with React. It keeps consumer callbacks fresh without making them connection dependencies.
- `types.ts` contains only the public contract, and `index.ts` exports that contract.

Do not create files for tiny policy helpers, serialized identities, or speculative state snapshots. Revisit a boundary only when ownership becomes ambiguous or the boundary has an independent durable contract.

## Data design

- Make public inputs and snapshots readonly by behavior; never mutate caller-owned headers, options, messages, or arrays.
- Compare caller header names case-insensitively. Reserve `Last-Event-ID` for transport-owned resume state rather than accepting a conflicting caller value.
- Use a discriminated phase when it prevents illegal resource combinations such as a live XHR and retry timer existing together.
- Narrow `unknown` at boundaries and preserve the original value as `cause` when useful.
- Avoid Context, providers, compound components, and render props in the core package. Reconsider them only for a future optional UI adapter with multiple visual consumers.

## Compatibility

- The peer range starts at React 17, so do not require React 18/19-only APIs such as `useEffectEvent`.
- Support both subscription-returning and legacy `removeEventListener` AppState cleanup.
- Keep React and React Native external in produced bundles.
- Do not assume DOM APIs beyond the XMLHttpRequest subset available in React Native.
