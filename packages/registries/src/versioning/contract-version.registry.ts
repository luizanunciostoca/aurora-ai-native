import type { ContractVersion } from '@aurora/contracts/versioning';

export const CONTRACT_VERSION_1_0_0 = '1.0.0' as ContractVersion;

/** Wire-contract compatibility authority. Package SemVer is managed separately. */
export const CONTRACT_VERSION_REGISTRY = {
  current: CONTRACT_VERSION_1_0_0,
  supportedRead: [CONTRACT_VERSION_1_0_0] as readonly ContractVersion[],
  supportedWrite: [CONTRACT_VERSION_1_0_0] as readonly ContractVersion[],
  versions: {
    '1.0.0': {
      lifecycle: 'CURRENT',
      breakingMajor: 1,
      notes: 'Initial accepted W01 wire-contract generation.',
    },
  },
} as const;
