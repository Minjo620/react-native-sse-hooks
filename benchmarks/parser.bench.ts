import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import EventSource from 'react-native-sse';
import { createParser } from '../src/parser';
import {
  buildBenchmarkStream,
  getBenchmarkScenarios,
  splitBenchmarkStream,
  type BenchmarkScenario,
} from './parser-harness';

const BASELINE_VERSION = 'react-native-sse@1.2.1';
const ITERATIONS = Number(process.env.ITERATIONS ?? 20);
const outputPath = process.env.BENCHMARK_OUTPUT;
const selectedNames = new Set(
  (process.env.SCENARIOS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

interface SampleSummary {
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  eventsPerSecond: number;
  samplesMs: number[];
}

interface ImplementationResult extends SampleSummary {
  implementation: string;
  delivered: number;
}

function createBaseline(onMessage: (data: string) => void): InstanceType<typeof EventSource> {
  const source = Object.create(EventSource.prototype) as InstanceType<typeof EventSource> &
    Record<string, unknown>;
  Object.assign(source, {
    CRLF: '\r\n',
    LF: '\n',
    CR: '\r',
    lineEndingCharacter: null,
    _lastIndexProcessed: 0,
    lastEventId: null,
    url: 'benchmark://local',
    debug: false,
    interval: 5_000,
    eventHandlers: {
      token: [(message: { data: string }) => onMessage(message.data)],
      message: [],
      open: [],
      error: [],
      done: [],
      close: [],
    },
  });
  return source;
}

function runBaseline(chunks: string[], values?: string[]): number {
  let delivered = 0;
  let response = '';
  const source = createBaseline(data => {
    delivered += 1;
    values?.push(data);
  }) as any;
  for (const chunk of chunks) {
    response += chunk;
    source._handleEvent(response);
  }
  return delivered;
}

function runCandidate(chunks: string[], values?: string[]): number {
  let delivered = 0;
  let response = '';
  let offset = 0;
  const parser = createParser();
  for (const chunk of chunks) {
    response += chunk;
    const events = parser.push(response.slice(offset));
    offset = response.length;
    for (const event of events) {
      if (event.type !== 'message') continue;
      delivered += 1;
      values?.push(event.value.data);
    }
  }
  return delivered;
}

function summarize(samples: number[], eventCount: number): SampleSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const medianMs = percentile(sorted, 0.5);
  return {
    medianMs: round(medianMs),
    p95Ms: round(percentile(sorted, 0.95)),
    minMs: round(sorted[0]!),
    maxMs: round(sorted[sorted.length - 1]!),
    eventsPerSecond: Math.round(eventCount / (medianMs / 1_000)),
    samplesMs: samples.map(round),
  };
}

function percentile(sorted: number[], quantile: number): number {
  return sorted[Math.ceil(sorted.length * quantile) - 1]!;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function validateScenario(scenario: BenchmarkScenario, chunks: string[]): void {
  const baselineValues: string[] = [];
  const candidateValues: string[] = [];
  const baselineCount = runBaseline(chunks, baselineValues);
  const candidateCount = runCandidate(chunks, candidateValues);
  if (baselineCount !== scenario.eventCount || candidateCount !== scenario.eventCount) {
    throw new Error(
      `${scenario.name}: expected ${scenario.eventCount} events, baseline=${baselineCount}, candidate=${candidateCount}`,
    );
  }
  if (JSON.stringify(baselineValues) !== JSON.stringify(candidateValues)) {
    throw new Error(`${scenario.name}: delivered data differs between implementations.`);
  }
}

function measureScenario(scenario: BenchmarkScenario) {
  const stream = buildBenchmarkStream(scenario);
  const chunks = splitBenchmarkStream(stream, scenario.chunkSize);
  validateScenario(scenario, chunks);
  runBaseline(chunks);
  runCandidate(chunks);

  const baselineSamples: number[] = [];
  const candidateSamples: number[] = [];
  let baselineDelivered = 0;
  let candidateDelivered = 0;

  const measure = (run: (input: string[]) => number, samples: number[]) => {
    global.gc?.();
    const start = performance.now();
    const delivered = run(chunks);
    samples.push(performance.now() - start);
    return delivered;
  };

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    if (iteration % 2 === 0) {
      baselineDelivered = measure(runBaseline, baselineSamples);
      candidateDelivered = measure(runCandidate, candidateSamples);
    } else {
      candidateDelivered = measure(runCandidate, candidateSamples);
      baselineDelivered = measure(runBaseline, baselineSamples);
    }
  }

  const baseline: ImplementationResult = {
    implementation: BASELINE_VERSION,
    delivered: baselineDelivered,
    ...summarize(baselineSamples, scenario.eventCount),
  };
  const candidate: ImplementationResult & { relativeToBaseline: number } = {
    implementation: 'react-native-sse-hooks',
    delivered: candidateDelivered,
    ...summarize(candidateSamples, scenario.eventCount),
    relativeToBaseline: 0,
  };
  candidate.relativeToBaseline = round(candidate.eventsPerSecond / baseline.eventsPerSecond);

  return {
    scenario,
    streamCodeUnits: stream.length,
    chunkCount: chunks.length,
    baseline,
    candidate,
  };
}

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 4 || ITERATIONS % 2 !== 0) {
  throw new TypeError('ITERATIONS must be an even integer of at least 4.');
}

const scenarios = getBenchmarkScenarios().filter(
  scenario => selectedNames.size === 0 || selectedNames.has(scenario.name),
);
if (scenarios.length === 0) throw new Error('No matching benchmark scenarios.');

const report = JSON.stringify(
  {
    environment: { node: process.version, iterations: ITERATIONS },
    results: scenarios.map(measureScenario),
  },
  null,
  2,
);
if (outputPath) {
  const absoluteOutputPath = resolve(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${report}\n`, 'utf8');
}
console.log(report);
