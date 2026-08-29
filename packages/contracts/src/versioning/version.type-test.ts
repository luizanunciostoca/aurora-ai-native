import type { ContractVersion, Version } from './types';

declare const version: Version;
declare const contractVersion: ContractVersion;

const genericFromContract: Version = contractVersion;
void genericFromContract;

// @ts-expect-error Generic/package-like Version must not be assignable to ContractVersion.
const contractFromGeneric: ContractVersion = version;
void contractFromGeneric;
