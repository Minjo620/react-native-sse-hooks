import assert from 'node:assert/strict';
import { useEventSource } from 'react-native-sse-hooks';

assert.equal(typeof useEventSource, 'function');
console.log('ESM consumer: loaded');
