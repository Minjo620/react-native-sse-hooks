# Repository instructions

Use the project skill at `.agents/skills/react-native-sse-hooks/SKILL.md` for every change to source code, tests, benchmarks, package metadata, or release tooling.

Keep `src/` function-oriented. Model the parser and transport as closure factories with explicit ownership; do not introduce classes, render-time side effects, artificial ordering delays, or module-level connection state.

Run `npm run check` before handing off a change. Run `npm run benchmark` as well when changing parser buffering, chunk consumption, or other claimed performance behavior.
