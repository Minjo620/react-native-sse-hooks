# Upstream policy

External Skills are references, not automatically binding repository rules. React's official documentation and verified runtime behavior take precedence.

## Adopt selectively

- Vercel Composition Patterns: use only for a future UI/provider adapter. Do not introduce Context or compound components into the Hook-first core.
- Clean Code TS React: adopt pure render, explicit boundaries, meaningful names, discriminated unions, readonly public data, behavior tests, and the warning against shallow over-decomposition. Reject claims that TypeScript `readonly` creates runtime wrapper allocations.
- Vercel React Best Practices: adopt accurate Effect dependencies, functional updates, derived state, and separation of independent synchronization. Reject Next.js, DOM, SWR, hydration, and browser-only rules unless a task actually targets them.

## Current reviewed snapshots

- `vercel-labs/agent-skills`: commit `7c180d9044c9ae2b442b567aad4e42a28dd5ed62` reviewed for `composition-patterns` and `react-best-practices`.
- `pproenca/dot-skills`: commit `c9228d2d0c1391190168845824ceb4e33bb844fb` reviewed for experimental `clean-code-ts-react`.

When upstream changes, compare the pinned commit to the new commit and review only changed relevant rules. Record adopted, adapted, and rejected changes here; do not re-import entire Skills or their compiled `AGENTS.md` files.

## Known semantic traps

- `useEffectEvent` functions are intentionally not stable and cannot be general callback refs. The package supports React 18, so retain a compatible commit-phase latest-callback pattern.
- Module-level once guards are not valid for per-Hook SSE connections and interfere with tests and Fast Refresh.
- Performance micro-rules do not override parser readability or protocol tests without benchmark evidence.
