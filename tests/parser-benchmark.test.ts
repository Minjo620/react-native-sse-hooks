import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkStream,
  getBenchmarkScenarios,
  splitBenchmarkStream,
} from '../benchmarks/parser-harness';

describe('parser benchmark fixtures', () => {
  it('defines the frozen core processing workload matrix', () => {
    expect(getBenchmarkScenarios()).toEqual([
      { name: 'llm-delta', eventCount: 500, payloadSize: 24, chunkSize: 128 },
      { name: 'tiny-chunks', eventCount: 200, payloadSize: 32, chunkSize: 8 },
      { name: 'normal-stream', eventCount: 2_000, payloadSize: 64, chunkSize: 256 },
      { name: 'large-events', eventCount: 64, payloadSize: 65_536, chunkSize: 4_096 },
      { name: 'high-throughput', eventCount: 20_000, payloadSize: 48, chunkSize: 16_384 },
    ]);
  });

  it('generates deterministic complete events and lossless fixed chunks', () => {
    const scenario = { name: 'literal', eventCount: 3, payloadSize: 4, chunkSize: 7 };
    const first = buildBenchmarkStream(scenario);
    const second = buildBenchmarkStream(scenario);

    expect(first).toBe(second);
    expect(first).toBe(
      'id: 0\nevent: token\ndata: {"sequence":0,"payload":"xxxx"}\n\nid: 1\nevent: token\ndata: {"sequence":1,"payload":"xxxx"}\n\nid: 2\nevent: token\ndata: {"sequence":2,"payload":"xxxx"}\n\n',
    );
    expect(splitBenchmarkStream(first, 7).join('')).toBe(first);
    expect(splitBenchmarkStream('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('rejects invalid counts, payloads, and chunk sizes', () => {
    expect(() =>
      buildBenchmarkStream({ name: 'bad', eventCount: 0, payloadSize: 1, chunkSize: 1 }),
    ).toThrow(/eventCount/);
    expect(() =>
      buildBenchmarkStream({ name: 'bad', eventCount: 1, payloadSize: -1, chunkSize: 1 }),
    ).toThrow(/payloadSize/);
    expect(() => splitBenchmarkStream('value', 0)).toThrow(/chunkSize/);
  });
});
