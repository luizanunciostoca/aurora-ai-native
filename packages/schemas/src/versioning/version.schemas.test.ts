import {
  ContractVersionSchema,
  SupportedContractVersionSchema,
  VersionSchema,
} from './version.schemas';
import { CONTRACT_VERSION_REGISTRY } from '../../../registries/src/versioning/contract-version.registry';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

const version = ContractVersionSchema.parse('1.0.0');
assert(
  ContractVersionSchema.serialize(version) === '1.0.0',
  'contract version round-trip failed',
);
assert(
  VersionSchema.parts(VersionSchema.parse('12.34.56')).major === 12,
  'major parsing failed',
);

for (const invalid of [
  '',
  '1',
  '1.0',
  '01.0.0',
  '1.00.0',
  'v1.0.0',
  '1.0.0-beta.1',
  '1.0.0+build',
]) {
  assert(!ContractVersionSchema.is(invalid), `invalid version accepted: ${invalid}`);
}

assert(
  SupportedContractVersionSchema.parse(CONTRACT_VERSION_REGISTRY.current) === '1.0.0',
  'current contract version was not accepted',
);
assertThrows(
  () => SupportedContractVersionSchema.parse('2.0.0'),
  'unsupported major contract version was accepted',
);
