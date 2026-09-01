'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ActionIntentSchema = void 0;
const internal_validation_1 = require('./internal-validation');
function capability(input, path) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  (0, internal_validation_1.exactKeys)(
    record,
    ['capability', 'actionType'],
    ['capability', 'actionType'],
    path,
  );
  return {
    capability: (0, internal_validation_1.nonEmptyString)(
      record.capability,
      `${path}.capability`,
      256,
    ),
    actionType: (0, internal_validation_1.nonEmptyString)(
      record.actionType,
      `${path}.actionType`,
      256,
    ),
  };
}
function providerBinding(input, path) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  (0, internal_validation_1.exactKeys)(
    record,
    ['provider', 'targetType', 'targetReference'],
    ['provider'],
    path,
  );
  const targetType = (0, internal_validation_1.optionalNonEmptyString)(
    record.targetType,
    `${path}.targetType`,
    128,
  );
  const targetReference = (0, internal_validation_1.optionalNonEmptyString)(
    record.targetReference,
    `${path}.targetReference`,
    1024,
  );
  return {
    provider: (0, internal_validation_1.nonEmptyString)(record.provider, `${path}.provider`, 128),
    ...(targetType === undefined ? {} : { targetType }),
    ...(targetReference === undefined ? {} : { targetReference }),
  };
}
function idempotency(input, path) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  const mode = (0, internal_validation_1.nonEmptyString)(record.mode, `${path}.mode`, 32);
  if (mode === 'REQUIRED') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['mode', 'key', 'reference'],
      ['mode', 'key'],
      path,
    );
    const reference = (0, internal_validation_1.optionalNonEmptyString)(
      record.reference,
      `${path}.reference`,
      1024,
    );
    return {
      mode,
      key: (0, internal_validation_1.nonEmptyString)(record.key, `${path}.key`, 512),
      ...(reference === undefined ? {} : { reference }),
    };
  }
  if (mode === 'NOT_APPLICABLE') {
    (0, internal_validation_1.exactKeys)(record, ['mode', 'reason'], ['mode', 'reason'], path);
    return {
      mode,
      reason: (0, internal_validation_1.nonEmptyString)(record.reason, `${path}.reason`, 512),
    };
  }
  throw new TypeError(`${path}.mode: unsupported idempotency mode`);
}
function preconditions(input, path) {
  if (!Array.isArray(input)) throw new TypeError(`${path}: expected array`);
  if (input.length > 64) throw new TypeError(`${path}: maximum 64 preconditions`);
  return input.map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    const record = (0, internal_validation_1.asRecord)(raw, itemPath);
    (0, internal_validation_1.exactKeys)(
      record,
      ['preconditionType', 'parameters'],
      ['preconditionType', 'parameters'],
      itemPath,
    );
    return {
      preconditionType: (0, internal_validation_1.nonEmptyString)(
        record.preconditionType,
        `${itemPath}.preconditionType`,
        256,
      ),
      parameters: (0, internal_validation_1.jsonObject)(
        record.parameters,
        `${itemPath}.parameters`,
      ),
    };
  });
}
function expectedState(input, path) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  (0, internal_validation_1.exactKeys)(
    record,
    ['stateType', 'value'],
    ['stateType', 'value'],
    path,
  );
  return {
    stateType: (0, internal_validation_1.nonEmptyString)(
      record.stateType,
      `${path}.stateType`,
      256,
    ),
    value: (0, internal_validation_1.jsonObject)(record.value, `${path}.value`),
  };
}
function authority(input, path, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  const kind = (0, internal_validation_1.nonEmptyString)(record.kind, `${path}.kind`, 64);
  if (kind === 'POLICY_TOKEN') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['kind', 'policyTokenId'],
      ['kind', 'policyTokenId'],
      path,
    );
    return { kind, policyTokenId: dependencies.parsePolicyTokenId(record.policyTokenId) };
  }
  if (kind === 'OWNER_DECISION') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['kind', 'decisionId'],
      ['kind', 'decisionId'],
      path,
    );
    return { kind, decisionId: dependencies.parseDecisionId(record.decisionId) };
  }
  if (kind === 'POLICY_AND_OWNER_DECISION') {
    (0, internal_validation_1.exactKeys)(
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
function parse(input, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, 'ActionIntent');
  (0, internal_validation_1.exactKeys)(
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
  let executionClassification;
  if (record.executionClassification !== undefined) {
    const value = (0, internal_validation_1.asRecord)(
      record.executionClassification,
      'ActionIntent.executionClassification',
    );
    (0, internal_validation_1.exactKeys)(
      value,
      ['riskClassificationRef', 'sideEffectClassificationRef'],
      [],
      'ActionIntent.executionClassification',
    );
    const riskClassificationRef = (0, internal_validation_1.optionalNonEmptyString)(
      value.riskClassificationRef,
      'ActionIntent.executionClassification.riskClassificationRef',
      512,
    );
    const sideEffectClassificationRef = (0, internal_validation_1.optionalNonEmptyString)(
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
      : (0, internal_validation_1.restrictedMetadata)(record.metadata, 'ActionIntent.metadata');
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
    resolvedParameters: (0, internal_validation_1.jsonObject)(
      record.resolvedParameters,
      'ActionIntent.resolvedParameters',
    ),
    idempotency: idempotency(record.idempotency, 'ActionIntent.idempotency'),
    preconditions: preconditions(record.preconditions, 'ActionIntent.preconditions'),
    ...(expectedStateValue === undefined ? {} : { expectedState: expectedStateValue }),
    deadlineAt: (0, internal_validation_1.timestamp)(record.deadlineAt, 'ActionIntent.deadlineAt'),
    authority: authority(record.authority, 'ActionIntent.authority', dependencies),
    ...(executionClassification === undefined ? {} : { executionClassification }),
    dataClassification: dependencies.parseDataClassification(record.dataClassification),
    ...(metadata === undefined ? {} : { metadata }),
  };
}
exports.ActionIntentSchema = Object.freeze({ parse });
