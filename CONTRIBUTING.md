# Contributing

Thank you for helping improve `react-native-sse-hooks`. Correctness and reproducible evidence take priority over the size or speed of a change.

## Before opening a pull request

1. Search existing Issues and open one for any non-trivial bug, feature, compatibility, or performance change.
2. Keep the public API Hook-first and keep parser/transport ownership function-oriented.
3. Add the lowest deterministic test that protects the behavior: parser first, then transport, then Hook.
4. Run the complete quality gate:

   ```bash
   npm ci
   npm run check
   ```

5. When changing parser buffering, chunk processing, loops, string operations, or performance claims, also run:

   ```bash
   npm run benchmark
   ```

6. Add a Changeset for every user-visible change. Documentation-only, test-only, and internal CI changes do not require a package release.

## Pull request expectations

- Explain the user-visible behavior and link the Issue it resolves.
- Include tests that fail when the protected behavior is broken.
- Preserve LF, CR, CRLF, chunk-boundary, Last-Event-ID, retry, stale-attempt, AppState, and cleanup invariants relevant to the change.
- Report the runtime, workload, samples, correctness checks, and raw output for performance claims.
- Do not commit credentials, cookies, access tokens, private endpoints, or personal data.
- Keep changes focused. Unrelated refactors should use a separate Issue and PR.

## Changesets

Run:

```bash
npm run changeset
```

Choose:

- `patch` for compatible fixes and small compatible improvements.
- `minor` for compatible public features.
- `major` for breaking public behavior after explicit maintainer approval.

The Changeset summary should describe the effect for package consumers, not the implementation history.

## Review and release

CI must pass before merge. Merging an ordinary PR updates the accumulated Release PR; it does not immediately publish npm. npm publication begins only after the maintainer reviews and merges the Release PR.
