import EventSource from 'react-native-sse';
import { describe, expect, it } from 'vitest';
import { createParser } from '../src/parser';

interface Message {
  data: string;
  event: string;
  id: string;
}

interface Fixture {
  name: string;
  input: string;
  expected: Message[];
  baselineConformant: boolean;
}

const fixtures: Fixture[] = [
  {
    name: 'preserves data whitespace and matches field names exactly',
    input: 'database: ignored\neventual: ignored\ndata:  value  \n\n',
    expected: [{ data: ' value  ', event: 'message', id: '' }],
    baselineConformant: false,
  },
  {
    name: 'joins data lines and accepts CRLF',
    input: 'event: token\r\ndata: first\r\ndata: second\r\n\r\n',
    expected: [{ data: 'first\nsecond', event: 'token', id: '' }],
    baselineConformant: true,
  },
  {
    name: 'treats an empty event field as message',
    input: 'event:\ndata: value\n\n',
    expected: [{ data: 'value', event: 'message', id: '' }],
    baselineConformant: true,
  },
  {
    name: 'ignores an id containing NUL',
    input: 'id: good\n\nid: bad\0id\ndata: value\n\n',
    expected: [{ data: 'value', event: 'message', id: 'good' }],
    baselineConformant: false,
  },
  {
    name: 'does not accept a partially numeric retry',
    input: 'retry: 10x\ndata: value\n\n',
    expected: [{ data: 'value', event: 'message', id: '' }],
    baselineConformant: true,
  },
  {
    name: 'ignores comments and removes one initial BOM',
    input: '\ufeff: comment\n: heartbeat\ndata: value\n\n',
    expected: [{ data: 'value', event: 'message', id: '' }],
    baselineConformant: true,
  },
  {
    name: 'does not dispatch an unterminated event at EOF',
    input: 'data: incomplete',
    expected: [],
    baselineConformant: true,
  },
];

function runCandidate(input: string, split: number): Message[] {
  const parser = createParser();
  return [input.slice(0, split), input.slice(split)]
    .flatMap(chunk => parser.push(chunk))
    .filter(event => event.type === 'message')
    .map(event => event.value);
}

function runBaseline(input: string, split: number): { messages: Message[]; retryInterval: number } {
  const messages: Message[] = [];
  const source = Object.create(EventSource.prototype) as InstanceType<typeof EventSource> &
    Record<string, any>;
  Object.assign(source, {
    CRLF: '\r\n',
    LF: '\n',
    CR: '\r',
    lineEndingCharacter: null,
    _lastIndexProcessed: 0,
    lastEventId: null,
    url: 'comparison://local',
    debug: false,
    interval: 5_000,
    eventHandlers: {},
    dispatch(type: string, event: { data?: string; lastEventId?: string | null }) {
      if (typeof event.data !== 'string') return;
      messages.push({
        data: event.data,
        event: type,
        id: event.lastEventId ?? '',
      });
    },
  });

  source._handleEvent(input.slice(0, split));
  source._handleEvent(input);
  return { messages, retryInterval: source.interval };
}

describe('react-native-sse baseline comparison', () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: candidate is invariant across every split point`, () => {
      for (let split = 0; split <= fixture.input.length; split += 1) {
        expect(runCandidate(fixture.input, split)).toEqual(fixture.expected);
      }
    });

    it(`${fixture.name}: baseline conformance is recorded`, () => {
      const output = runBaseline(fixture.input, Math.floor(fixture.input.length / 2)).messages;
      if (fixture.baselineConformant) expect(output).toEqual(fixture.expected);
      else expect(output).not.toEqual(fixture.expected);
    });
  }

  it('rejects a partially numeric retry that the baseline accepts', () => {
    const candidate = createParser().push('retry: 10x\n\n');
    const baseline = runBaseline('retry: 10x\n\n', 0);

    expect(candidate).toEqual([]);
    expect(baseline.retryInterval).toBe(10);
  });
});
