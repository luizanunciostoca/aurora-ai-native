// @ts-expect-error -- repository test harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- repository test harness intentionally has no @types/node.
import test from 'node:test';

import { sanitizeAccessibleText } from '../src/index.js';

test('W16 accessible text strips control characters and collapses whitespace', () => {
  const input = `Aurora${String.fromCharCode(0)}\n\t ready`;
  assert.equal(sanitizeAccessibleText(input), 'Aurora ready');
});

test('W16 accessible text obeys a bounded output length', () => {
  assert.equal(sanitizeAccessibleText('123456789', 5), '12345');
});
