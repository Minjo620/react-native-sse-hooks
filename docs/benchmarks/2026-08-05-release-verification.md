# 0.1.0 release-candidate verification

This record verifies the exact `react-native-sse-hooks@0.1.0` npm tarball built from commit `81736b5` before any registry publication.

## Artifact identity

- Filename: `react-native-sse-hooks-0.1.0.tgz`
- npm integrity: `sha512-hRpUqnpH7hA+WqPwr2yfG+SJ318aW4CuDbma2vHNld/vCPXCIN+1TIwj6JXugx2URgtE4590axmVdsheCEFClg==`
- npm shasum: `ef88ddfda896bd3c7988ad4b88c696c48c5fde31`
- SHA-256: `87dfcba2f6856851e0ddbcdaf406178ea7b3a8054467da34bcfc47c6790be1e5`
- Packed size: 18,367 bytes; unpacked size: 64,142 bytes
- Allowlisted files: `LICENSE`, both READMEs, `package.json`, and the four CJS/ESM/declaration files under `dist/` (8 entries total)

`npm ls react-native-sse-hooks` in the Expo consumer resolved version `0.1.0` from `file:vendor/react-native-sse-hooks-0.1.0.tgz`. Its lockfile integrity exactly matched the value above; it was neither an npm link nor a source-directory dependency.

## Environment

- macOS host, Xcode 26.6 (`17F113`)
- iPhone 17 Pro Simulator, iOS 26.5
- Expo Go 57.0.6, Expo SDK 57.0.0
- React Native 0.86.2, React 19.2.3
- Hermes; Expo production bundle (`--no-dev --minify`)
- Node 24.18.0 and npm 11.16.0
- Local deterministic HTTP/SSE server on `127.0.0.1:8790`

The host's global `xcode-select` remained unchanged. iOS commands used `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` per invocation.

## Commands and gates

The library gate completed with 5 test files and 44 tests passing, zero production dependency vulnerabilities, successful CJS/ESM/declaration builds, `publint`/`attw`, and clean tarball installs through ESM, CJS, and TypeScript fixtures:

```bash
npm run check
npm pack --json --ignore-scripts
```

The Expo consumer completed all 11 tests, type checking, linting, and an iOS production export. Dotenv and Expo public-variable inlining were disabled for the export so the local test Cookie could not enter the artifact:

```bash
npm test
npm run typecheck
npm run lint
EXPO_NO_DOTENV=1 EXPO_NO_CLIENT_ENV_VARS=1 \
  npx expo export --platform ios --output-dir <temporary-directory> --clear
```

Metro bundled 1,116 modules successfully. The resulting iOS launch asset was identified as `Hermes JavaScript bytecode, version 98`; a credential-pattern scan over the export returned no matches.

The production Simulator run used:

```bash
npm run benchmark:server
EXPO_NO_DOTENV=1 EXPO_PUBLIC_BENCHMARK_AUTORUN=true \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  npx expo start --ios --go --no-dev --minify --localhost --clear
```

Metro selected the `react-native`/ESM package export and Hermes loaded it in Expo Go. The app issued actual React Native `XMLHttpRequest` SSE connections to the deterministic local server.

## Simulator correctness and measurements

Three independently reloaded suites completed. Each suite contained 78 connections, including warm-up, and 63 measured connections. Across 234 total connections and 189 measured connections:

- every run delivered the configured event count in sequence;
- every implementation produced the same per-workload data hash;
- all five workloads passed in all three suites;
- `developmentBundle` was `false` in every report.

Fresh aggregate medians versus `react-native-sse@1.2.1` configured with a 0 ms initial delay:

| Workload          | Throughput | Processing time |   Total time |
| ----------------- | ---------: | --------------: | -----------: |
| `llm-delta`       |     +7.05% |     6.60% lower | 36.71% lower |
| `tiny-chunks`     |     +2.96% |     2.88% lower | 22.94% lower |
| `normal-stream`   |    +21.32% |    17.57% lower | 30.68% lower |
| `large-events`    |     +8.84% |     8.12% lower | 11.79% lower |
| `high-throughput` |    +17.16% |    14.65% lower | 19.46% lower |

`tiny-chunks` is below the predeclared 5% timing threshold, so this run supports correctness and a positive direction but not a stable performance advantage for that workload. Simulator timing remains environment-specific and does not represent a physical iPhone or production network.

## Lifecycle coverage boundary

The Simulator suites exercise repeated XHR creation, incremental delivery, server EOF, callback delivery, and component replacement/unmount across the packed artifact. The deterministic SDK suite separately verifies manual close, explicit reconnect, stale-request retirement, background pause/active resume, unmount cleanup, and `Last-Event-ID` continuity.

The latter cases were not re-enacted with physical iOS background scheduling in this release check. This distinction is intentional: a Simulator cannot establish real-device radio, power, or suspension behavior, and adding a release-only UI harness would not improve that claim.

## Raw evidence

- [Aggregate report](./data/2026-08-05/release-verification/aggregate-report.json)
- [Suite 1](./data/2026-08-05/release-verification/suite-1.json)
- [Suite 2](./data/2026-08-05/release-verification/suite-2.json)
- [Suite 3](./data/2026-08-05/release-verification/suite-3.json)

The Expo runtime choices follow the [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/), which maps SDK 57 to React Native 0.86 and documents its supported iOS/Xcode range. The build deliberately uses Expo's standard Metro pipeline rather than a custom resolver.
