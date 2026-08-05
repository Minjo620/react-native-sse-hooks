const assert = require('node:assert/strict');
const { useEventSource } = require('react-native-sse-hooks');

assert.equal(typeof useEventSource, 'function');
console.log('CJS consumer: loaded');
