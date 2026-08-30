import type {
  ActionAuthorityReference,
  ActionIdempotency,
  ActionIntent,
  ActionPrecondition,
  CapabilityActionReference,
  ExpectedState,
  ProviderBinding,
} from '@aurora/contracts/actions';
import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  TenantContext,
} from '@aurora/contracts/context';
import type { ActionIntentId, DecisionId, PolicyTokenId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import {
  asRecord,
  exactKeys,
  jsonObject,
  nonEmptyString,
  optionalNonEmptyString,
  restrictedMetadata,
  timestamp,
  type DependencyParser,
} from './internal-validation';

export interface ActionIntentSchemaDependencies {
  readonly parseContractVersion: DependencyParser<ContractVersion>;
  readonly parseActionIntentId: DependencyParser<ActionIntentId>;
  readonly parseTenantContext: DependencyParser<TenantContext>;
  readonly parseActorRef: DependencyParser<ActorRef>;
  readonly parseCorrelationContext: DependencyParser<CorrelationContext>;
  readonly parseDataClassification: DependencyParser<DataClassification>;
  readonly parsePolicyTokenId: DependencyParser<PolicyTokenId>;
  readonly parseDecisionId: DependencyParser<DecisionId>;
}

function capability(input: unknown, path: string): CapabilityActionReference {
  const record = asRecord(input, path);
  exactKeys(record, ['capability', 'actionType'], ['capability', 'actionType'], path);
  return {
    capability: nonEmptyString(record.capability, `${path}.capability`, 256),
    actionType: nonEmptyString(record.actionType, `${path}.actionType`, 256),
  };
}

function providerBinding(input: unknown, path: string): ProviderBinding {
  const record = asRecord(input, path);
  exactKeys(record, ['provider', 'targetType', 'targetReference'], ['provider'], path);
  const targetType = optionalNonEmptyString(record.targetType, `${path}.targetType`, 128);
  const targetReference = optionalNonEmptyString(
    record.targetReference,
    `${path}.targetReference`,
    1024,
  );
  return {
    provider: nonEmptyString(record.provider, `${path}.provider`, 128),
    ...(targetType === undefined ? {} : { targetType }),
    ...(targetReference === undefined ? {} : { targetReference }),
  };
}

function idempotency(input: unknown, path: string): ActionIdempotency {
  const record = asRecord(input, path);
  const mode = nonEmptyString(record.mode, `${path}.mode`, 32);
  if (mode === 'REQUIRED') {
    exactKeys(record, ['mode', 'key', 'reference'], ['mode', 'key'], path);
    const reference = optionalNonEmptyString(record.reference, `${path}.reference`, 1024);
    return {
      mode,
      key: nonEmptyString(record.key, `${path}.key`, 512),
      ...(reference === undefined ? {} : { reference }),
    };
  }
  if (mode === 'NOT_APPLICABLE') {
    exactKeys(record, ['mode', 'reason'], ['mode', 'reason'], path);
    return { mode, reason: nonEmptyString(record.reason, `${path}.reason`, 512) };
  }
  throw new TypeError(`${path}.mode: unsupported idempotency mode`);
}

function preconditions(input: unknown, path: string): readonly ActionPrecondition[] {
  if (!Array.isArray(input)) throw new TypeError(`${path}: expected array`);
  if (input.length > 64) throw new TypeError(`${path}: maximum 64 preconditions`);
  return input.map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const record = asRecord(raw, itemPath);
    exactKeys(
      record,
      ['preconditionType', 'parameters'],
      ['preconditionType', 'parameters'],
      itemPath,
    );
    return {
      preconditionType: nonEmptyString(
        record.preconditionType,
        `${itemPath}.preconditionType`,
        256,
      ),
      parameters: jsonObject(record.parameters, `${itemPath}.parameters`),
    };
  });
}

function expectedState(input: unknown, path: string): ExpectedState {
  const record = asRecord(input, path);
  exactKeys(record, ['stateType', 'value'], ['stateType', 'value'], path);
  return {
    stateType: nonEmptyString(record.stateType, `${path}.stateType`, 256),
    value: jsonObject(record.value, `${path}.value`),
  };
}

function authority(
  input: unknown,
  path: string,
  dependencies: ActionIntentSchemaDependencies,
): ActionAuthorityReference {
  const record = asRecord(input, path);
  const kind = nonEmptyString(record.kind, `${path}.kind`, 64);
  if (kind === 'POLICY_TOKEN') {
    exactKeys(record, ['kind', 'policyTokenId'], ['kind', 'policyTokenId'], path);
    return { kind, policyTokenId: dependencies.parsePolicyTokenId(record.policyTokenId) };
  }
  if (kind === 'OWNER_DECISION') {
    exactKeys(record, ['kind', 'decisionId'], ['kind', 'decisionId'], path);
    return { kind, decisionId: dependencies.parseDecisionId(record.decisionId) };
  }
  if (kind === 'POLICY_AND_OWNER_DECISION') {
    exactKeys(
      record,
      ['kind', 'policyTokenId', 'decisionId'],
      ['kind', 'policyTokenId', 'decisionId'],
      path,
    );
    return {
      kind,
      policyTokenId: dependencies.parsePolicyTokenId(record.policyTokenId),
      decisionId: dependencies.parseDecisionId(record.decisionId),
    };
  }
  throw new TypeError(`${path}.kind: unsupported authority reference kind`);
}

function parse(input: unknown, dependencies: ActionIntentSchemaDependencies): ActionIntent {
  const record = asRecord(input, 'ActionIntent');
  exactKeys(
    record,
    [
      'kind',
      'schemaVersion',
      'actionIntentId',
      'capability',
      'providerBinding',
      'tenant',
      'actor',
      'requestOrigin',
      'correlation',
      'resolvedParameters',
      'idempotency',
      'preconditions',
      'expectedState',
      'deadlineAt',
      'authority',
      'executionClassification',
      'dataClassification',
      'metadata',
    ],
    [
      'kind',
      'schemaVersion',
      'actionIntentId',
      'capability',
      'tenant',
      'actor',
      'requestOrigin',
      'correlation',
      'resolvedParameters',
      'idempotency',
      'preconditions',
      'deadlineAt',
      'authority',
      'dataClassification',
    ],
    'ActionIntent',
  );
  if (record.kind !== 'ACTION_INTENT') {
    throw new TypeError('ActionIntent.kind: expected ACTION_INTENT');
  }

  let executionClassification: ActionIntent['executionClassification'];
  if (record.executionClassification !== undefined) {
    const value = asRecord(record.executionClassification, 'ActionIntent.executionClassification');
    exactKeys(
      value,
      ['riskClassificationRef', 'sideEffectClassificationRef'],
      [],
      'ActionIntent.executionClassification',
    );
    const riskClassificationRef = optionalNonEmptyString(
      value.riskClassificationRef,
      'ActionIntent.executionClassification.riskClassificationRef',
      512,
    );
    const sideEffectClassificationRef = optionalNonEmptyString(
      value.sideEffectClassificationRef,
      'ActionIntent.executionClassification.sideEffectClassificationRef',
      512,
    );
    if (riskClassificationRef === undefined && sideEffectClassificationRef === undefined) {
      throw new TypeError(
        'ActionIntent.executionClassification: at least one reference is required',
      );
    }
    executionClassification = {
      ...(riskClassificationRef === undefined ? {} : { riskClassificationRef }),
      ...(sideEffectClassificationRef === undefined ? {} : { sideEffectClassificationRef }),
    };
  }

  const providerBindingValue =
    record.providerBinding === undefined
      ? undefined
      : providerBinding(record.providerBinding, 'ActionIntent.providerBinding');
  const expectedStateValue =
    record.expectedState === undefined
      ? undefined
      : expectedState(record.expectedState, 'ActionIntent.expectedState');
  const metadata =
    record.metadata === undefined
      ? undefined
      : restrictedMetadata(record.metadata, 'ActionIntent.metadata');

  return {
    kind: 'ACTION_INTENT',
    schemaVersion: dependencies.parseContractVersion(record.schemaVersion),
    actionIntentId: dependencies.parseActionIntentId(record.actionIntentId),
    capability: capability(record.capability, 'ActionIntent.capability'),
    ...(providerBindingValue === undefined ? {} : { providerBinding: providerBindingValue }),
    tenant: dependencies.parseTenantContext(record.tenant),
    actor: dependencies.parseActorRef(record.actor),
    requestOrigin: dependencies.parseActorRef(record.requestOrigin),
    correlation: dependencies.parseCorrelationContext(record.correlation),
    resolvedParameters: jsonObject(record.resolvedParameters, 'ActionIntent.resolvedParameters'),
    idempotency: idempotency(record.idempotency, 'ActionIntent.idempotency'),
    preconditions: preconditions(record.preconditions, 'ActionIntent.preconditions'),
    ...(expectedStateValue === undefined ? {} : { expectedState: expectedStateValue }),
    deadlineAt: timestamp(record.deadlineAt, 'ActionIntent.deadlineAt'),
    authority: authority(record.authority, 'ActionIntent.authority', dependencies),
    ...(executionClassification === undefined ? {} : { executionClassification }),
    dataClassification: dependencies.parseDataClassification(record.dataClassification),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export const ActionIntentSchema = Object.freeze({ parse });
