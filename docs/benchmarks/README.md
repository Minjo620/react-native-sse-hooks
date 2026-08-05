# Benchmark methodology

English | [简体中文](./README.zh-CN.md)

This directory contains reproducible methods, concise results, and raw evidence for `react-native-sse-hooks`. Results are observations for documented runtimes, devices, and workloads—not universal promises for every React Native application.

## Compared implementations

- Candidate: this repository's incremental SSE parser and `useEventSource` Hook.
- Baseline: unmodified [`react-native-sse@1.2.1`](https://github.com/binaryminds/react-native-sse).
- Connection comparisons retain both the baseline's default `timeoutBeforeConnection: 500` and an explicit `timeoutBeforeConnection: 0`. Processing throughput is compared only with the 0 ms baseline so an artificial wait is not counted as parser performance.

## Node/V8 parser method

- Runtime: Node.js 24.18.0 (V8).
- Both implementations receive the same generated stream and cumulative `XMLHttpRequest.responseText` snapshots.
- The candidate feeds only the new suffix to its incremental parser; the baseline receives cumulative snapshots as its public implementation does.
- Each workload collects 20 samples per implementation per suite, with strictly balanced AB/BA order. Three independent suites are retained as aggregate evidence.
- Event count and every delivered `data` value are checked before timing; incorrect output is excluded.
- Reports include median, P95, min, max, events per second, and raw samples.
- Node results measure JavaScript parser work only. They exclude the React Native bridge, Hermes, XHR, networking, rendering, and device power.

Reproduce locally:

```bash
npm ci
BENCHMARK_OUTPUT=benchmark-results/node-v8.json npm run benchmark
```

Optional controls:

```bash
ITERATIONS=20 SCENARIOS=llm-delta,normal-stream npm run benchmark
```

`ITERATIONS` must be an even integer of at least 4 so execution order remains balanced.

## Expo/Hermes production method

- Device: iPhone 17 Pro simulator.
- OS: iOS 26.5.
- Expo SDK: 57.0.0.
- React Native: 0.86.2.
- JavaScript engine: Hermes.
- Container: Expo Go.
- Bundle: `--no-dev --minify` production bundle.
- Baseline: `react-native-sse@1.2.1`.
- Three independent suites, 234 connections, and 189 measured connections.
- A run is measured only when event count, order, and hash are correct. All retained suites were correct and all hashes matched.

The simulator path includes XHR connection scheduling, cumulative response processing, parsing, and Hook callbacks. It does not represent physical-device cellular networking, energy use, thermal behavior, or real users. Device claims require separate device measurements.

## Workloads

| Name              | Events | Payload size | Chunk size | Purpose                           |
| ----------------- | -----: | -----------: | ---------: | --------------------------------- |
| `llm-delta`       |    500 |           24 |        128 | LLM token/delta traffic           |
| `tiny-chunks`     |    200 |           32 |          8 | Frequent tiny chunks              |
| `normal-stream`   |  2,000 |           64 |        256 | Ordinary cumulative stream        |
| `large-events`    |     64 |       65,536 |      4,096 | Large events and string handling  |
| `high-throughput` | 20,000 |           48 |     16,384 | High-throughput single connection |

## Interpretation rules

1. Correctness precedes speed; wrong count, order, or hash invalidates a result.
2. Scheduled shared-runner benchmarks are trend evidence and do not block a PR for small timing changes.
3. Published tables include the environment, sample size, baseline configuration, and unfavorable results.
4. A Node, Hermes, or simulator result is not generalized to every runtime or device.
5. Claims such as “faster,” “zero-cost,” or “universally improved” require direct evidence and are otherwise avoided.

See [2026-08-05-results.md](./2026-08-05-results.md) for retained results and [`data/2026-08-05/`](./data/2026-08-05/) for raw JSON.
