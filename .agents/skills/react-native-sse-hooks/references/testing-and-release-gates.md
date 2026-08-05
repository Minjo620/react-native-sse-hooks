# Testing and release gates

## Protect contracts, not files

- Keep three suites: `parser.test.ts`, `transport.test.ts`, and `useEventSource.test.tsx`.
- Parser tests protect protocol output, chunk-boundary invariance, EOF, ID, and retry semantics.
- Transport tests protect full connection stories: incremental delivery and resume, stale-attempt retirement, retry boundaries, pause/resume, protocol failures, and request formation.
- Hook tests protect public React behavior: latest callbacks, AppState policy, manual ownership, semantic option changes, legacy cleanup, unmount, and Strict Mode replay.
- Prefer table-driven fixtures and complete scenarios over one test per branch or helper.
- A source-file merge, helper rename, or equivalent state representation should not require test changes.
- Mock only true boundaries: XHR, AppState, time, and external baseline packages. Run owned parser and transport code for real.

## Automated gates

`npm run check` must pass with no warnings. It runs:

1. Prettier check.
2. Type-aware ESLint and React Hooks rules.
3. Strict TypeScript compilation.
4. Vitest with global regression coverage thresholds.
5. CJS, ESM, and declaration build.
6. `publint` and Are The Types Wrong against the packed artifact.

The production source bans class declarations through ESLint. Tests may use small fake classes to emulate host APIs.

## Coverage policy

Coverage is a regression floor, not a target. Do not use per-file thresholds: they reward tests for temporary helpers and discourage deleting shallow modules. Keep a moderate global floor, inspect uncovered core paths, and add a test only when the uncovered behavior is a durable contract.

## Dependency and package policy

- Commit the lockfile and use `npm ci` in CI.
- Keep the runtime dependency set empty unless a dependency materially improves correctness or measured behavior.
- Keep `exports`, `main`, `module`, `react-native`, and `types` aligned with actual build output.
- Run package checks after every change to entry points, module format, TypeScript configuration, or build tooling.
- Treat production dependency audit findings as release blockers. Evaluate development-only advisories according to reachability and build risk; do not run blind force upgrades.
