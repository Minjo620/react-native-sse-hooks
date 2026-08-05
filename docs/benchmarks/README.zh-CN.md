# Benchmark 方法

[English](./README.md) | 简体中文

本目录保存 `react-native-sse-hooks` 的可复现性能方法、结果摘要与原始数据。性能结果是特定 runtime、设备和 workload 下的实验观察，不是对所有 React Native 应用的普遍承诺。

## 比较对象

- 候选实现：本仓库的增量 SSE parser 与 `useEventSource` Hook。
- 对标实现：未修改的 [`react-native-sse@1.2.1`](https://github.com/binaryminds/react-native-sse)。
- 连接比较同时保留对标库默认 `timeoutBeforeConnection: 500` 和显式 `timeoutBeforeConnection: 0` 两组；处理吞吐只与 0 ms 组比较，避免把人为等待算作 parser 收益。

## Node/V8 parser 方法

- Runtime：Node.js 24.18.0（V8）。
- 数据：两种实现接收完全相同的生成流和累计 `XMLHttpRequest.responseText` 快照。
- 候选实现只向增量 parser 传入新增后缀；对标实现按其公开实现接收累计响应。
- 每个 workload、每个实现、每个 suite 采集 20 个样本；执行顺序严格平衡为 AB/BA，最终保留三份独立 suite。
- 计时前先验证事件数量和所有 `data` 值完全一致；错误结果不进入性能比较。
- 报告 median、P95、min、max、每秒事件数和原始样本。
- Node 结果只衡量 JavaScript parser；不包含 React Native bridge、Hermes、XHR、网络、渲染或设备能耗。

本地复现：

```bash
npm ci
BENCHMARK_OUTPUT=benchmark-results/node-v8.json npm run benchmark
```

可选参数：

```bash
ITERATIONS=20 SCENARIOS=llm-delta,normal-stream npm run benchmark
```

`ITERATIONS` 必须是至少为 4 的偶数，保证交替执行顺序平衡。

## Expo/Hermes production 方法

- 设备：iPhone 17 Pro 模拟器。
- 系统：iOS 26.5。
- Expo SDK：57.0.0。
- React Native：0.86.2。
- JavaScript 引擎：Hermes。
- 容器：Expo Go。
- Bundle：`--no-dev --minify` production bundle。
- 对标版本：`react-native-sse@1.2.1`。
- 三个独立 suite，共 234 次连接，其中 189 次为 measured connection。
- 只有事件数量、顺序与 Hash 全部正确的运行才进入统计；最终三份 suite 全部正确且 Hash 一致。

模拟器测量包含 XHR 建联调度、累计响应读取、parser 和 Hook 回调，但不代表物理设备的蜂窝网络、功耗、温度或真实用户环境。真机结论必须另行测量。

## Workload

| 名称              | 事件数 | Payload 大小 | Chunk 大小 | 目的                 |
| ----------------- | -----: | -----------: | ---------: | -------------------- |
| `llm-delta`       |    500 |           24 |        128 | 模拟 LLM token/delta |
| `tiny-chunks`     |    200 |           32 |          8 | 高频极小分块         |
| `normal-stream`   |  2,000 |           64 |        256 | 常规累计流           |
| `large-events`    |     64 |       65,536 |      4,096 | 大事件与字符串处理   |
| `high-throughput` | 20,000 |           48 |     16,384 | 单连接高吞吐         |

## 解释规则

1. 正确性优先于速度；计数、顺序或 Hash 错误的结果无效。
2. 共享 GitHub Runner 的定时 benchmark 只用于趋势观察，不以小幅计时变化阻止 PR。
3. 对外性能表必须同时给出环境、样本量、对标配置和不利结果。
4. 不把单次 Node、Hermes 或模拟器结果外推到所有 runtime 和设备。
5. 未经真实测量，不用“更快”“零开销”或“普遍提升”等绝对表述。

完整结果见 [2026-08-05-results.md](./2026-08-05-results.md)，原始 JSON 见 [`data/2026-08-05/`](./data/2026-08-05/)。
