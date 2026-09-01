'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.EXECUTION_OUTCOMES = void 0;
/**
 * Canonical execution outcome vocabulary owned exclusively by W01-E.
 *
 * VERIFIED is the only state that proves the intended external effect.
 * EXECUTED_ACKNOWLEDGED must never be treated as VERIFIED.
 * EXECUTION_UNCERTAIN must never be collapsed into FAILED.
 */
exports.EXECUTION_OUTCOMES = [
  'NOT_ATTEMPTED',
  'REJECTED',
  'EXECUTED_ACKNOWLEDGED',
  'EXECUTION_UNCERTAIN',
  'VERIFIED',
  'FAILED',
];
