import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { ContractVersion } from '@aurora/contracts/versioning';
import {
  asRecord,
  exactKeys,
  nonEmptyString,
  optionalNonEmptyString,
  type DependencyParser,
} from '../actions/internal-validation';

export interface ExecutionTargetReferenceSchemaDependencies {
  readonly parseContractVersion: DependencyParser<ContractVersion>;
}

function parse(
  input: unknown,
  dependencies: ExecutionTargetReferenceSchemaDependencies,
  path = 'ExecutionTargetReference',
): ExecutionTargetReference {
  const record = asRecord(input, path);
  const kind = nonEmptyString(record.kind, `${path}.kind`, 64);
  const schemaVersion = dependencies.parseContractVersion(record.schemaVersion);

  if (kind === 'PROVIDER') {
    exactKeys(
      record,
      ['schemaVersion', 'kind', 'provider', 'targetType', 'targetReference', 'accountReference'],
      ['schemaVersion', 'kind', 'provider'],
      path,
    );
    const targetType = optionalNonEmptyString(record.targetType, `${path}.targetType`, 128);
    const targetReference = optionalNonEmptyString(
      record.targetReference,
      `${path}.targetReference`,
      1024,
    );
    const accountReference = optionalNonEmptyString(
      record.accountReference,
      `${path}.accountReference`,
      512,
    );
    return {
      schemaVersion,
      kind,
      provider: nonEmptyString(record.provider, `${path}.provider`, 128),
      ...(targetType === undefined ? {} : { targetType }),
      ...(targetReference === undefined ? {} : { targetReference }),
      ...(accountReference === undefined ? {} : { accountReference }),
    };
  }

  if (kind === 'DEVICE' || kind === 'WORKFLOW' || kind === 'LOCAL_SERVICE') {
    exactKeys(
      record,
      ['schemaVersion', 'kind', 'bindingReference'],
      ['schemaVersion', 'kind', 'bindingReference'],
      path,
    );
    return {
      schemaVersion,
      kind,
      bindingReference: nonEmptyString(record.bindingReference, `${path}.bindingReference`, 1024),
    };
  }

  throw new TypeError(`${path}.kind: unsupported execution target kind`);
}

export const ExecutionTargetReferenceSchema = Object.freeze({ parse });
