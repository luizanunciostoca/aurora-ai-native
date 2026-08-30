export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Metadata is intentionally shallow and bounded by runtime schemas. */
export interface RestrictedMetadata {
  readonly [key: string]: JsonPrimitive | readonly JsonPrimitive[];
}

export interface ExternalReference {
  readonly system: string;
  readonly reference: string;
}

export interface CapabilityActionReference {
  readonly capability: string;
  readonly actionType: string;
}

export interface ProviderBinding {
  readonly provider: string;
  readonly targetType?: string;
  readonly targetReference?: string;
}

export type ActionIdempotency =
  | Readonly<{
      mode: 'REQUIRED';
      key: string;
      reference?: string;
    }>
  | Readonly<{
      mode: 'NOT_APPLICABLE';
      reason: string;
    }>;

export interface ActionPrecondition {
  readonly preconditionType: string;
  readonly parameters: JsonObject;
}

export interface ExpectedState {
  readonly stateType: string;
  readonly value: JsonObject;
}

/**
 * References governed risk/side-effect vocabularies without defining them here.
 * W01-B must not create a competing policy/risk taxonomy.
 */
export interface ExecutionClassificationReference {
  readonly riskClassificationRef?: string;
  readonly sideEffectClassificationRef?: string;
}
