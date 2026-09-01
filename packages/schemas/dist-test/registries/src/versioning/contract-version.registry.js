'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CONTRACT_VERSION_REGISTRY = exports.CONTRACT_VERSION_1_0_0 = void 0;
exports.CONTRACT_VERSION_1_0_0 = '1.0.0';
/** Wire-contract compatibility authority. Package SemVer is managed separately. */
exports.CONTRACT_VERSION_REGISTRY = {
  current: exports.CONTRACT_VERSION_1_0_0,
  supportedRead: [exports.CONTRACT_VERSION_1_0_0],
  supportedWrite: [exports.CONTRACT_VERSION_1_0_0],
  versions: {
    '1.0.0': {
      lifecycle: 'CURRENT',
      breakingMajor: 1,
      notes: 'Initial accepted W01 wire-contract generation.',
    },
  },
};
