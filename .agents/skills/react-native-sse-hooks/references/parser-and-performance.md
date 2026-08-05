# Parser and performance

## Protocol invariants

- Accept LF, CR, and CRLF, including delimiters split across chunks.
- Remove one leading BOM only at stream start.
- Ignore comment lines and unknown fields; match field names exactly.
- Remove at most one optional space after the colon and preserve all other whitespace.
- Join multiple `data` lines with `\n`; dispatch only on an empty line when data exists.
- Default an empty event type to `message` and reset event/data buffers after every block.
- Ignore `id` values containing NUL and accept `retry` only when it is an unsigned safe integer.
- Do not dispatch an unterminated final event at EOF.
- Commit the last event ID at the empty-line dispatch step, even when the data buffer is empty and no message callback fires. Do not commit an unterminated block at EOF.

Test parser output for the whole stream, every split point, and one-character chunks. A parser result must not depend on transport chunking.

## React Native XHR behavior

React Native exposes cumulative `responseText` during `LOADING`. Track an offset per XHR attempt and feed only the suffix. Treat a shrinking response as an error instead of duplicating or corrupting events.

Never delay connection setup to wait for handlers. Build parser and callbacks before calling `open`/`send`.

## Buffers

- Keep pending data private to one parser instance.
- Prefer arrays plus one final join for multiple data lines; avoid repeated whole-event concatenation.
- Do not rescan an unfinished line from its beginning every time a chunk arrives.
- Preserve correctness under one-character chunks, Unicode surrogate pairs, and empty chunks.
- Do not expose buffer-limit configuration while cumulative React Native XHR memory remains outside the parser's control.

## Benchmark discipline

- Run `npm run benchmark` when changing chunk consumption, string slicing, buffering, loops, or dispatch allocation.
- Compare the same generated stream, chunk sizes, event count, warm-up, iterations, and runtime.
- Report median throughput and verify delivered event counts before comparing speed.
- Keep correctness probes separate from timing.
- Do not claim a universal improvement from one Node/Hermes/device result. Record runtime, device, event size, and chunk distribution.
