# Parser benchmark

For the complete method, retained results, and raw evidence, see
[`docs/benchmarks/README.md`](../docs/benchmarks/README.md) or the
[Chinese methodology](../docs/benchmarks/README.zh-CN.md).

This benchmark compares the installed, unmodified `react-native-sse@1.2.1` parser with this package's incremental parser.

Both implementations receive the same sequence of cumulative `XMLHttpRequest.responseText` snapshots. The baseline receives each cumulative snapshot as its public implementation does; the candidate extracts only the new suffix before feeding its incremental parser.

```sh
npm run benchmark
```

Optional controls:

```sh
EVENT_COUNT=50000 ITERATIONS=10 CHUNK_SIZES=16,64,256 npm run benchmark
```

Report median time, throughput, and delivered-event count together. Node results measure parser overhead only; they do not represent React Native bridge, rendering, native networking, radio, or device performance. Device benchmarks must be reported separately.
