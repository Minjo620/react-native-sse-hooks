import { describe, expect, it } from 'vitest';
import { createParser, type ParserEvent } from '../src/parser';

function parse(chunks: string[], finish = false): ParserEvent[] {
  const parser = createParser();
  const events = chunks.flatMap(chunk => parser.push(chunk));
  if (finish) events.push(...parser.finish());
  return events;
}

describe('parser contract', () => {
  it('exposes the committed Last-Event-ID without allocating a protocol event', () => {
    const parser = createParser('previous');

    expect(parser.push('id: committed\n\n')).toEqual([]);
    expect(parser.getLastEventId()).toBe('committed');
  });

  it('produces the same protocol events for every meaningful chunking', () => {
    const input =
      '\ufeff: heartbeat\r\nid: 42\r\nevent: update\r\ndata: hello  \r\ndata: world 😀\r\nretry: 2500\r\n\r\n';
    const expected: ParserEvent[] = [
      { type: 'retry', value: 2500 },
      {
        type: 'message',
        value: { data: 'hello  \nworld 😀', event: 'update', id: '42' },
      },
    ];
    const chunkings = [[input], [...input]];
    for (let split = 0; split <= input.length; split += 1) {
      chunkings.push([input.slice(0, split), input.slice(split)]);
    }

    for (const chunks of chunkings) expect(parse(chunks)).toEqual(expected);
  });

  it('matches fields exactly and preserves protocol whitespace', () => {
    expect(
      parse(['database: ignored\neventual: ignored\ndata:  leading and trailing  \n\n']),
    ).toEqual([
      {
        type: 'message',
        value: { data: ' leading and trailing  ', event: 'message', id: '' },
      },
    ]);

    expect(parse(['retry: 10x\nid: good\nid: bad\0id\ndata: ok\n\n'])).toEqual([
      { type: 'message', value: { data: 'ok', event: 'message', id: 'good' } },
    ]);
  });

  it('commits only terminated IDs and carries them into later messages', () => {
    const parser = createParser('previous');
    expect(parser.push('id: 7\n\nid:\n\ndata: next\n\n')).toEqual([
      { type: 'message', value: { data: 'next', event: 'message', id: '' } },
    ]);
    expect(parser.getLastEventId()).toBe('');

    const incomplete = createParser('previous');
    expect(incomplete.push('id: discarded\ndata: incomplete')).toEqual([]);
    expect(incomplete.finish()).toEqual([]);
    expect(incomplete.getLastEventId()).toBe('previous');
  });

  it('uses a trailing CR as a real EOF line ending without inventing one', () => {
    expect(parse(['data: complete\r\r'], true)).toEqual([
      {
        type: 'message',
        value: { data: 'complete', event: 'message', id: '' },
      },
    ]);
    expect(parse(['data: incomplete'], true)).toEqual([]);
  });

  it.each([
    {
      name: 'accepts bare fields and dispatches an explicitly empty data field',
      input: 'event\ndata\n\n',
      expected: [
        { type: 'message', value: { data: '', event: 'message', id: '' } },
      ] satisfies ParserEvent[],
    },
    {
      name: 'accepts mixed LF CR and CRLF line endings',
      input: 'data: first\rdata: second\r\ndata: third\n\r',
      expected: [
        {
          type: 'message',
          value: { data: 'first\nsecond\nthird', event: 'message', id: '' },
        },
      ] satisfies ParserEvent[],
    },
    {
      name: 'removes only the stream-leading BOM and ignores comments and unknown fields',
      input:
        '\ufeff: first comment\n: second comment\nunknown: value\n\ufeffdata: ignored\ndata: kept\n\n',
      expected: [
        { type: 'message', value: { data: 'kept', event: 'message', id: '' } },
      ] satisfies ParserEvent[],
    },
    {
      name: 'resets event type on an empty block without data',
      input: 'event: stale\n\ndata: current\n\n',
      expected: [
        { type: 'message', value: { data: 'current', event: 'message', id: '' } },
      ] satisfies ParserEvent[],
    },
    {
      name: 'commits an ID-only block and preserves the last valid retry',
      input: `id: committed\n\nretry: ${Number.MAX_SAFE_INTEGER}\nretry: ${Number.MAX_SAFE_INTEGER}0\ndata: value\n\n`,
      expected: [
        { type: 'retry', value: Number.MAX_SAFE_INTEGER },
        {
          type: 'message',
          value: { data: 'value', event: 'message', id: 'committed' },
        },
      ] satisfies ParserEvent[],
    },
  ])('$name for whole, every split, empty, and one-character chunks', ({ input, expected }) => {
    const chunkings = [[input], ['', input, ''], [...input]];
    for (let split = 0; split <= input.length; split += 1) {
      chunkings.push([input.slice(0, split), '', input.slice(split)]);
    }

    for (const chunks of chunkings) expect(parse(chunks)).toEqual(expected);
  });
});
