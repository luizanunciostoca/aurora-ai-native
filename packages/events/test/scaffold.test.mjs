import assert from 'node:assert/strict';
import test from 'node:test';

test('W03 shared events package scaffold exposes no runtime behavior', async () => {
  const module = await import('../dist/index.js');
  assert.deepEqual(Object.keys(module), ['__esModule']);
});
