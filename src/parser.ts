import type { EventSourceMessage } from './types';

/** parser 产生的消息或服务端重试间隔更新。 */
export type ParserEvent =
  { type: 'message'; value: EventSourceMessage } | { type: 'retry'; value: number };

/** 一条 SSE 响应流的增量解析器。 */
export interface SSEParser {
  /** 消费新增响应片段并返回本次完成的协议事件。 */
  push: (chunk: string) => ParserEvent[];
  /** 结束当前流；未由空行终止的最后一个事件不会被派发。 */
  finish: () => ParserEvent[];
  /** 返回最近一个完整 block 已提交的事件 ID。 */
  getLastEventId: () => string;
}

/**
 * 每个 parser 只拥有一条 XHR 响应的半成品。解析结果作为值返回，使业务回调异常不会
 * 中断 parser、污染剩余 buffer，transport 也不需要额外的消息中转层。
 *
 * @param initialLastEventId - 恢复连接时继承的已提交事件 ID。
 * @returns 只能由单条响应流拥有的增量 parser。
 */
export function createParser(initialLastEventId = ''): SSEParser {
  let pending = '';
  let scanFrom = 0;
  let skipLeadingLF = false;
  let data: string[] = [];
  let event = '';
  let lastEventId = initialLastEventId;
  let pendingEventId = initialLastEventId;
  let firstLine = true;

  function completeBlock(output: ParserEvent[]): void {
    if (pendingEventId !== lastEventId) {
      lastEventId = pendingEventId;
    }

    if (data.length > 0) {
      output.push({
        type: 'message',
        value: {
          data: data.join('\n'),
          event: event || 'message',
          id: lastEventId,
        },
      });
    }

    data = [];
    event = '';
  }

  function consumeLine(input: string, output: ParserEvent[]): void {
    let line = input;
    if (firstLine) {
      firstLine = false;
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
    }

    if (line === '') {
      completeBlock(output);
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'data':
        data.push(value);
        break;
      case 'event':
        event = value;
        break;
      case 'id':
        if (!value.includes('\0')) pendingEventId = value;
        break;
      case 'retry':
        if (/^[0-9]+$/.test(value)) {
          const delay = Number(value);
          if (Number.isSafeInteger(delay)) output.push({ type: 'retry', value: delay });
        }
    }
  }

  function push(chunk: string): ParserEvent[] {
    if (!chunk) return [];

    if (skipLeadingLF) {
      skipLeadingLF = false;
      if (chunk.charCodeAt(0) === 10) chunk = chunk.slice(1);
      if (!chunk) return [];
    }

    pending += chunk;
    const output: ParserEvent[] = [];
    let lineStart = 0;
    // 热路径使用原生字符串查找并保留 scanFrom，避免小 chunk 到达时反复扫描未完成行。
    let nextCR = pending.indexOf('\r', scanFrom);
    let nextLF = pending.indexOf('\n', scanFrom);

    while (nextCR >= 0 || nextLF >= 0) {
      const isCR = nextCR >= 0 && (nextLF < 0 || nextCR < nextLF);
      let lineEnd = isCR ? nextCR : nextLF;

      consumeLine(pending.slice(lineStart, lineEnd), output);
      if (isCR) {
        if (nextLF === lineEnd + 1) {
          lineEnd = nextLF;
          nextLF = pending.indexOf('\n', lineEnd + 1);
        } else if (lineEnd === pending.length - 1) {
          skipLeadingLF = true;
        }
        nextCR = pending.indexOf('\r', lineEnd + 1);
      } else {
        nextLF = pending.indexOf('\n', lineEnd + 1);
      }
      lineStart = lineEnd + 1;
    }

    pending = pending.slice(lineStart);
    scanFrom = pending.length;
    return output;
  }

  /** EOF 不补造空行，因此未终止的最后一个事件不会被派发。 */
  function finish(): ParserEvent[] {
    pending = '';
    scanFrom = 0;
    skipLeadingLF = false;
    return [];
  }

  const getLastEventId = () => lastEventId;

  return { push, finish, getLastEventId };
}
