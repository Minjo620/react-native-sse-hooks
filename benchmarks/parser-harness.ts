export interface BenchmarkScenario {
  name: string;
  eventCount: number;
  payloadSize: number;
  chunkSize: number;
}

const CORE_SCENARIOS: readonly BenchmarkScenario[] = Object.freeze([
  { name: 'llm-delta', eventCount: 500, payloadSize: 24, chunkSize: 128 },
  { name: 'tiny-chunks', eventCount: 200, payloadSize: 32, chunkSize: 8 },
  { name: 'normal-stream', eventCount: 2_000, payloadSize: 64, chunkSize: 256 },
  { name: 'large-events', eventCount: 64, payloadSize: 65_536, chunkSize: 4_096 },
  { name: 'high-throughput', eventCount: 20_000, payloadSize: 48, chunkSize: 16_384 },
]);

export function getBenchmarkScenarios(): BenchmarkScenario[] {
  return CORE_SCENARIOS.map(scenario => ({ ...scenario }));
}

export function buildBenchmarkStream(scenario: BenchmarkScenario): string {
  assertPositiveInteger(scenario.eventCount, 'eventCount');
  if (!Number.isSafeInteger(scenario.payloadSize) || scenario.payloadSize < 0) {
    throw new TypeError('payloadSize must be a non-negative integer.');
  }
  assertPositiveInteger(scenario.chunkSize, 'chunkSize');

  const payload = 'x'.repeat(scenario.payloadSize);
  let stream = '';
  for (let sequence = 0; sequence < scenario.eventCount; sequence += 1) {
    stream += `id: ${sequence}\nevent: token\ndata: ${JSON.stringify({ sequence, payload })}\n\n`;
  }
  return stream;
}

export function splitBenchmarkStream(value: string, chunkSize: number): string[] {
  assertPositiveInteger(chunkSize, 'chunkSize');
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize));
  }
  return chunks;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}
