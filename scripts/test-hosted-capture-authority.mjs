import assert from 'node:assert/strict';
import { CaptureAuthorityError, createCaptureStore } from './hosted-acceptance-captures.mjs';

const expectCode = (fn, code) => {
  assert.throws(fn, (error) => error instanceof CaptureAuthorityError && error.code === code);
};

const store = createCaptureStore();
assert.equal(store.captureFromResponse('auth', [
  { name: 'user.id', path: '/user/id', type: 'string', pattern: '^[0-9a-f-]{36}$', maxLength: 36 },
  { name: 'session.version', path: '/version', type: 'number' },
  { name: 'feature.enabled', path: '/enabled', type: 'boolean' },
], {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  version: 3,
  enabled: true,
}), 3);

assert.equal(store.count(), 3);
assert.deepEqual([...store.names()].sort(), ['feature.enabled', 'session.version', 'user.id']);
assert.equal(store.ownerOf('user.id'), 'auth');
assert.deepEqual(store.resolve({
  path: '/api/sessions/{{capture:user.id}}/v/{{capture:session.version}}',
  version: '{{capture:session.version}}',
  enabled: '{{capture:feature.enabled}}',
  nested: [{ id: '{{capture:user.id}}' }],
}), {
  path: '/api/sessions/11111111-1111-4111-8111-111111111111/v/3',
  version: 3,
  enabled: true,
  nested: [{ id: '11111111-1111-4111-8111-111111111111' }],
});

expectCode(() => store.resolve('{{capture:future.id}}'), 'CAPTURE_REFERENCE_UNKNOWN');
expectCode(() => store.resolve('x/{{capture:future.id}}/y'), 'CAPTURE_REFERENCE_UNKNOWN');
expectCode(() => store.resolve('x/{{capture:broken}/y'), 'CAPTURE_REFERENCE_MALFORMED');
expectCode(() => store.resolve({ '{{capture:user.id}}': 'nope' }), 'CAPTURE_REFERENCE_IN_KEY');

expectCode(() => store.captureFromResponse('duplicate', [{ name: 'user.id', path: '/id' }], { id: 'x' }), 'CAPTURE_NAME_DUPLICATE');
expectCode(() => store.captureFromResponse('missing', [{ name: 'missing', path: '/missing' }], {}), 'CAPTURE_POINTER_MISSING');
expectCode(() => store.captureFromResponse('object', [{ name: 'object', path: '/value' }], { value: {} }), 'CAPTURE_VALUE_NOT_SCALAR');
expectCode(() => store.captureFromResponse('array', [{ name: 'array', path: '/value' }], { value: [] }), 'CAPTURE_VALUE_NOT_SCALAR');
expectCode(() => store.captureFromResponse('null', [{ name: 'nullValue', path: '/value' }], { value: null }), 'CAPTURE_VALUE_NOT_SCALAR');
expectCode(() => store.captureFromResponse('type', [{ name: 'typed', path: '/value', type: 'number' }], { value: '3' }), 'CAPTURE_VALUE_TYPE_MISMATCH');
expectCode(() => store.captureFromResponse('pattern', [{ name: 'patterned', path: '/value', type: 'string', pattern: '^ok$' }], { value: 'bad' }), 'CAPTURE_VALUE_PATTERN_MISMATCH');
expectCode(() => store.captureFromResponse('large', [{ name: 'large', path: '/value', type: 'string' }], { value: 'x'.repeat(513) }), 'CAPTURE_VALUE_TOO_LARGE');
expectCode(() => store.captureFromResponse('invalid-name', [{ name: '1bad', path: '/value' }], { value: 'x' }), 'CAPTURE_NAME_INVALID');
expectCode(() => store.captureFromResponse('invalid-pattern', [{ name: 'badPattern', path: '/value', type: 'string', pattern: '[' }], { value: 'x' }), 'CAPTURE_PATTERN_INVALID');

const atomic = createCaptureStore();
expectCode(() => atomic.captureFromResponse('atomic', [
  { name: 'first', path: '/first' },
  { name: 'second', path: '/missing' },
], { first: 'must-not-stick' }), 'CAPTURE_POINTER_MISSING');
assert.equal(atomic.count(), 0, 'capture application must be atomic on validation failure');

const secretLike = 'a'.repeat(64);
const privateStore = createCaptureStore();
privateStore.captureFromResponse('clearspeak-authority', [
  { name: 'clearspeak.capability', path: '/capability', type: 'string', pattern: '^[a-f0-9]{64}$', maxLength: 64 },
], { capability: secretLike });
assert.equal(JSON.stringify(privateStore), '{}', 'capture values must remain closure-private and non-serializable');
assert.equal(privateStore.resolve('{{capture:clearspeak.capability}}'), secretLike);
privateStore.clear();
expectCode(() => privateStore.resolve('{{capture:clearspeak.capability}}'), 'CAPTURE_REFERENCE_UNKNOWN');

const limited = createCaptureStore();
expectCode(() => limited.captureFromResponse('too-many', Array.from({ length: 9 }, (_, index) => ({
  name: `n${index}`,
  path: `/n${index}`,
})), Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`n${index}`, index]))), 'CAPTURE_DECLARATIONS_INVALID');

console.log('P0-8 hosted capture/reference authority guard passed');
await import('./test-hosted-v4-runner-contract.mjs');
