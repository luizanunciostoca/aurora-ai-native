import { evaluateConsent, type ConsentRecord } from '@aurora/contracts/consent';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { PolicySnapshot } from '@aurora/contracts/policy-engine';
import type { InformationalPolicyEvaluationRequest } from '@aurora/contracts/policy-query';
import {
  lookupCurrentPolicy,
  precheckPolicy,
  type CurrentPolicySource,
} from '@aurora/policy-core/query';

import type { ContextQuery } from '../query/types.js';
import { validateContextQuery } from '../query/validate.js';
import { evaluateContextRetrieval } from '../retrieval/evaluate.js';
import type { ContextRetrievalPolicy } from '../retrieval/types.js';
import { acquireContextCandidates } from '../sources/acquire.js';
import type {
  ContextAcquisitionResult,
  ContextSourceAdapter,
  ContextSourceItem,
} from '../sources/types.js';
import { compileMinimalContext } from './compile.js';
import {
  compilePublicLocalModelPrompt,
  type PublicLocalModelPromptResult,
} from './model-prompt.js';
import type { MinimalContextCompilerLimits } from './types.js';

/** Private projection of W14 identity; this does not create a session or authority. */
export interface PublicModelContextBinding {
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
  readonly requestId: string;
  readonly deadlineMs: number;
}

/** Supplied by the current owning source, never by a prompt or network request body. */
export interface CurrentPublicModelContextRecord {
  readonly kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_RECORD';
  readonly reference: string;
  readonly binding: PublicModelContextBinding;
  readonly observedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly query: ContextQuery;
  readonly policyEvaluation: Omit<InformationalPolicyEvaluationRequest, 'snapshot' | 'evaluatedAt'>;
  readonly instruction: string;
  readonly retrievalPolicy: Omit<ContextRetrievalPolicy, 'evaluatedAt'>;
  readonly compilerLimits: MinimalContextCompilerLimits;
  readonly allowedAdapterIds: readonly string[];
}

/**
 * Read-only ports to existing owner truth, NOT a new consent/provenance registry.
 * Synchronous reads must be current, side-effect-free and non-blocking. They must
 * not return a cached approval, a caller-supplied record or an Android permission.
 * No production implementation of these owner ports is installed by this leaf.
 */
export interface CurrentPublicModelContextOwner {
  readCurrent(binding: PublicModelContextBinding): CurrentPublicModelContextRecord | null;
  readonly policy: CurrentPolicySource;
  readonly adapters: readonly ContextSourceAdapter[];
  readCurrentSource(
    binding: PublicModelContextBinding,
    adapterId: string,
    sourceReference: string,
  ): ContextSourceItem | null;
}

export interface CurrentPublicModelContextPreparation {
  readonly kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_PREPARATION';
  readonly binding: PublicModelContextBinding;
  readonly contextRef: string;
  readonly observedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly minimizedPublicPrompt: Extract<PublicLocalModelPromptResult, { status: 'READY' }>;
}

interface Inputs {
  readonly record: CurrentPublicModelContextRecord;
  readonly policy: PolicySnapshot;
}
interface AdapterCapture {
  readonly descriptor: ContextSourceAdapter['descriptor'];
  readonly adapter: ContextSourceAdapter;
  readonly read: ContextSourceAdapter['read'];
}
interface SourceCapture {
  readonly adapterId: string;
  readonly item: ContextSourceItem;
}
interface Prepared {
  readonly result: CurrentPublicModelContextPreparation;
  readonly inputs: Inputs;
  readonly adapters: readonly AdapterCapture[];
  readonly sources: readonly SourceCapture[];
  readonly acquisition: ContextAcquisitionResult;
  readonly signal: AbortSignal;
  lastCheckedAt: number;
}

const BINDING_KEYS = [
  'tenantId',
  'actorIdentityId',
  'correlationId',
  'gatewaySessionId',
  'connectionId',
  'gatewayGeneration',
  'deviceSessionId',
  'deviceId',
  'registrationVersion',
  'requestId',
  'deadlineMs',
] as const;
const RECORD_KEYS = [
  'kind',
  'reference',
  'binding',
  'observedAtEpochMs',
  'expiresAtEpochMs',
  'query',
  'policyEvaluation',
  'instruction',
  'retrievalPolicy',
  'compilerLimits',
  'allowedAdapterIds',
] as const;
const POLICY_KEYS = [
  'kind',
  'schemaVersion',
  'policy',
  'correlation',
  'tenant',
  'tenantBoundary',
  'actor',
  'subject',
  'action',
  'requestedScope',
  'purpose',
  'jurisdiction',
  'jurisdictionRestrictions',
  'dataClassification',
  'consent',
] as const;
const QUERY_KEYS = [
  'kind',
  'schemaVersion',
  'tenant',
  'correlation',
  'actor',
  'subject',
  'purpose',
  'jurisdiction',
  'consent',
  'requiresConsent',
  'maxDataClassification',
  'currentness',
  'selectors',
  'requestedFields',
  'deadline',
  'limits',
] as const;
const MAX_AGE_MS = 10_000;
const MAX_REQUEST_MS = 30_000;
const MAX_TIME_MS = 8_640_000_000_000_000;
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('CURRENT_PUBLIC_CONTEXT_UNAVAILABLE');
}
function time(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME_MS
  );
}
function text(value: unknown, limit = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}
function token(value: unknown): value is string {
  return text(value) && /^[A-Za-z0-9._:-]+$/u.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): boolean {
  return (
    record(value) &&
    Object.keys(value).every((key) => allowed.includes(key)) &&
    required.every((key) => Object.hasOwn(value, key))
  );
}
function same(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  };
  return canonical(left) === canonical(right);
}
function drainNativePromise(value: unknown): void {
  try {
    void Promise.prototype.then.call(
      value,
      () => undefined,
      () => undefined,
    );
  } catch {
    /* Non-Promises are rejected without reading or assimilating their then property. */
  }
}

/** Bounded immutable own-data ingress; no getters, JSON hooks, iterators or mutable aliases. */
function capture(value: unknown): unknown {
  let nodes = 0;
  let units = 0;
  const active = new Set<object>();
  const visit = (part: unknown, depth: number): unknown => {
    nodes += 1;
    requireValue(nodes <= 4_096 && depth <= 24);
    if (typeof part === 'string') {
      units += part.length;
      requireValue(units <= 131_072);
      return part;
    }
    if (part === null || part === undefined || typeof part === 'boolean') return part;
    if (typeof part === 'number' && Number.isFinite(part)) return part;
    requireValue(typeof part === 'object' && !active.has(part));
    const array = Array.isArray(part);
    const prototype = Object.getPrototypeOf(part);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) {
      drainNativePromise(part);
      throw new Error('CURRENT_PUBLIC_CONTEXT_UNAVAILABLE');
    }
    const ownKeys = Reflect.ownKeys(part);
    requireValue(ownKeys.length <= 129 && ownKeys.every((key) => typeof key === 'string'));
    active.add(part);
    try {
      if (array) {
        const length = Object.getOwnPropertyDescriptor(part, 'length')?.value as unknown;
        requireValue(
          typeof length === 'number' &&
            Number.isSafeInteger(length) &&
            length >= 0 &&
            length <= 128 &&
            ownKeys.length === length + 1,
        );
        const result: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const property = Object.getOwnPropertyDescriptor(part, String(index));
          requireValue(property && 'value' in property);
          result.push(visit(property.value, depth + 1));
        }
        return Object.freeze(result);
      }
      const result: Record<string, unknown> = {};
      for (const key of ownKeys as string[]) {
        const property = Object.getOwnPropertyDescriptor(part, key);
        requireValue(property && 'value' in property);
        Object.defineProperty(result, key, {
          value: visit(property.value, depth + 1),
          enumerable: true,
        });
      }
      return Object.freeze(result);
    } finally {
      active.delete(part);
    }
  };
  return visit(value, 0);
}

function bound(value: unknown): PublicModelContextBinding {
  const result = capture(value);
  requireValue(keys(result, BINDING_KEYS));
  const binding = result as unknown as PublicModelContextBinding;
  for (const key of BINDING_KEYS) {
    if (key === 'gatewayGeneration' || key === 'registrationVersion') {
      requireValue(Number.isSafeInteger(binding[key]) && binding[key] >= 1);
    } else if (key === 'deadlineMs') requireValue(time(binding[key]));
    else requireValue(token(binding[key]));
  }
  requireValue(binding.requestId.length <= 128 && binding.gatewaySessionId.length <= 128);
  return binding;
}
function aborted(signal: AbortSignal): boolean {
  requireValue(abortedGetter);
  return abortedGetter.call(signal) === true;
}
function timestamp(value: unknown): number {
  requireValue(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value),
  );
  const epoch = Date.parse(value);
  requireValue(time(epoch));
  return epoch;
}
function at(value: number): Rfc3339Timestamp {
  return new Date(value).toISOString() as Rfc3339Timestamp;
}
function stringArray(value: unknown, max = 16): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= max &&
    value.every((item) => text(item)) &&
    new Set(value).size === value.length
  );
}

function consentFor(
  record_: CurrentPublicModelContextRecord,
  now: number,
): ConsentRecord | undefined {
  const supplied = record_.policyEvaluation.consent;
  if (supplied === undefined) {
    requireValue(record_.query.consent === undefined && record_.query.requiresConsent !== true);
    return undefined;
  }
  requireValue(
    keys(
      supplied,
      [
        'kind',
        'schemaVersion',
        'reference',
        'tenantId',
        'subject',
        'status',
        'grantedAt',
        'expiresAt',
        'revokedAt',
        'scope',
        'provenance',
        'classification',
      ],
      [
        'kind',
        'schemaVersion',
        'reference',
        'tenantId',
        'subject',
        'status',
        'grantedAt',
        'scope',
        'provenance',
      ],
    ),
  );
  requireValue(
    supplied.kind === 'ConsentRecord' &&
      supplied.schemaVersion === record_.query.schemaVersion &&
      supplied.status === 'ACTIVE' &&
      supplied.revokedAt === undefined &&
      supplied.tenantId === record_.binding.tenantId &&
      same(supplied.subject, record_.policyEvaluation.subject) &&
      same(supplied.reference, record_.query.consent) &&
      keys(supplied.reference, ['kind', 'reference', 'version']) &&
      supplied.reference.kind === 'CONSENT_RECORD' &&
      token(supplied.reference.reference) &&
      text(supplied.reference.version),
  );
  requireValue(
    keys(supplied.scope, ['purposeIds', 'jurisdictions', 'dataCategories'], ['purposeIds']) &&
      stringArray(supplied.scope.purposeIds) &&
      (supplied.scope.jurisdictions === undefined || stringArray(supplied.scope.jurisdictions)),
  );
  // W06 has no canonical data-category mapping. Do not silently ignore such a restriction.
  requireValue(supplied.scope.dataCategories === undefined);
  requireValue(
    keys(supplied.provenance, ['source', 'reference', 'capturedAt']) &&
      text(supplied.provenance.source) &&
      text(supplied.provenance.reference),
  );
  const granted = timestamp(supplied.grantedAt);
  const captured = timestamp(supplied.provenance.capturedAt);
  const expires = supplied.expiresAt === undefined ? undefined : timestamp(supplied.expiresAt);
  requireValue(
    granted <= now &&
      captured <= now &&
      (expires === undefined || (expires > now && expires > granted)),
  );
  const consent: ConsentRecord = {
    ...supplied,
    grantedAt: at(granted),
    ...(expires === undefined ? {} : { expiresAt: at(expires) }),
    provenance: { ...supplied.provenance, capturedAt: at(captured) },
  };
  // Canonical W02 validation; normalized timestamp representation preserves the same instants.
  requireValue(
    evaluateConsent({
      schemaVersion: record_.query.schemaVersion,
      correlationId: record_.query.correlation.correlationId,
      tenantId: record_.query.tenant.tenantId,
      subject: record_.policyEvaluation.subject,
      purpose: record_.query.purpose,
      jurisdiction: record_.query.jurisdiction,
      evaluatedAt: at(now),
      consent,
    }).satisfied,
  );
  return consent;
}

function validPolicySnapshot(value: unknown): PolicySnapshot {
  const snapshot = capture(value) as PolicySnapshot;
  requireValue(
    keys(snapshot, ['kind', 'policy', 'state', 'rules']) &&
      snapshot.kind === 'PolicySnapshot' &&
      snapshot.state === 'ACTIVE' &&
      keys(snapshot.policy, ['reference', 'version']) &&
      token(snapshot.policy.reference) &&
      text(snapshot.policy.version) &&
      Array.isArray(snapshot.rules) &&
      snapshot.rules.length > 0 &&
      snapshot.rules.length <= 64,
  );
  for (const rule of snapshot.rules) {
    requireValue(
      keys(
        rule,
        [
          'ruleId',
          'effect',
          'action',
          'scope',
          'tenantIds',
          'actorKinds',
          'actorIdentityIds',
          'subjectReferences',
          'purposeIds',
          'jurisdictions',
          'dataClassifications',
          'consentRequired',
          'authorityRequired',
          'reasonReference',
        ],
        ['ruleId', 'effect', 'action', 'scope'],
      ),
    );
    requireValue(
      text(rule.ruleId) &&
        ['ALLOW', 'DENY', 'REQUIRE_APPROVAL'].includes(rule.effect) &&
        text(rule.action) &&
        stringArray(rule.scope) &&
        (rule.consentRequired === undefined || typeof rule.consentRequired === 'boolean') &&
        (rule.authorityRequired === undefined || typeof rule.authorityRequired === 'boolean'),
    );
    for (const name of [
      'tenantIds',
      'actorKinds',
      'actorIdentityIds',
      'subjectReferences',
      'purposeIds',
      'jurisdictions',
      'dataClassifications',
    ] as const)
      requireValue(rule[name] === undefined || stringArray(rule[name]));
  }
  requireValue(new Set(snapshot.rules.map((rule) => rule.ruleId)).size === snapshot.rules.length);
  return snapshot;
}

function inputs(
  owner: CurrentPublicModelContextOwner,
  binding: PublicModelContextBinding,
  now: number,
): Inputs {
  const value = capture(owner.readCurrent(binding));
  requireValue(keys(value, RECORD_KEYS));
  const current = value as unknown as CurrentPublicModelContextRecord;
  requireValue(
    current.kind === 'CURRENT_PUBLIC_MODEL_CONTEXT_RECORD' &&
      token(current.reference) &&
      same(bound(current.binding), binding) &&
      time(current.observedAtEpochMs) &&
      time(current.expiresAtEpochMs) &&
      current.observedAtEpochMs <= now &&
      current.expiresAtEpochMs > now &&
      current.expiresAtEpochMs <= binding.deadlineMs &&
      current.expiresAtEpochMs - current.observedAtEpochMs <= MAX_AGE_MS,
  );
  const query = current.query;
  const policy = current.policyEvaluation;
  requireValue(
    keys(query, QUERY_KEYS, [
      'kind',
      'schemaVersion',
      'tenant',
      'correlation',
      'actor',
      'purpose',
      'jurisdiction',
      'maxDataClassification',
      'currentness',
      'selectors',
      'limits',
    ]) &&
      keys(policy, POLICY_KEYS, [
        'kind',
        'schemaVersion',
        'policy',
        'correlation',
        'tenant',
        'tenantBoundary',
        'actor',
        'subject',
        'action',
        'requestedScope',
        'purpose',
        'jurisdiction',
        'dataClassification',
      ]),
  );
  requireValue(
    query.tenant?.tenantId === binding.tenantId &&
      query.correlation?.correlationId === binding.correlationId &&
      query.actor?.identityId === binding.actorIdentityId &&
      policy.kind === 'PolicyEvaluationRequest' &&
      policy.schemaVersion === query.schemaVersion &&
      same(policy.tenant, query.tenant) &&
      same(policy.correlation, query.correlation) &&
      same(policy.actor, query.actor) &&
      same(policy.purpose, query.purpose) &&
      same(policy.jurisdiction, query.jurisdiction) &&
      keys(policy.subject, ['kind', 'identityId']) &&
      policy.subject.kind === 'IDENTITY' &&
      policy.subject.identityId === binding.actorIdentityId &&
      (query.subject === undefined || same(query.subject, policy.subject)) &&
      query.maxDataClassification === 'PUBLIC' &&
      policy.dataClassification === 'PUBLIC' &&
      query.currentness === 'CURRENT_REQUIRED' &&
      text(policy.action) &&
      stringArray(policy.requestedScope) &&
      keys(policy.policy, ['reference', 'version']) &&
      token(policy.policy.reference) &&
      text(policy.policy.version),
  );
  requireValue(
    policy.tenantBoundary?.status === 'WITHIN_BOUNDARY' &&
      policy.tenantBoundary.reason === 'BOUNDARY_CONFIRMED' &&
      policy.tenantBoundary.correlationId === binding.correlationId &&
      policy.tenantBoundary.evidence?.evaluatedTenantId === binding.tenantId &&
      policy.tenantBoundary.evidence.actorIdentityId === binding.actorIdentityId &&
      policy.tenantBoundary.evidence.matchedBindingCount === 1 &&
      same(policy.tenantBoundary.evidence.observedBindingTenantIds, [binding.tenantId]),
  );
  requireValue(
    validateContextQuery(query).valid &&
      (query.requiresConsent === undefined || typeof query.requiresConsent === 'boolean') &&
      stringArray(current.allowedAdapterIds, 4) &&
      Array.isArray(query.selectors) &&
      query.selectors.length <= 4 &&
      query.selectors.every(
        (selector) =>
          selector.sourceClass === 'COMPANY_KNOWLEDGE' &&
          current.allowedAdapterIds.includes(selector.adapterId),
      ) &&
      query.limits.maxSourceFanout <= 4 &&
      query.limits.maxItemsPerSource <= 4 &&
      query.limits.maxTotalItems <= 4 &&
      text(current.instruction, 4_096) &&
      new TextEncoder().encode(current.instruction).byteLength <= 4_096 &&
      keys(current.compilerLimits, ['maxItems', 'maxCanonicalUnits']) &&
      Number.isSafeInteger(current.compilerLimits.maxItems) &&
      current.compilerLimits.maxItems >= 1 &&
      current.compilerLimits.maxItems <= 4 &&
      Number.isSafeInteger(current.compilerLimits.maxCanonicalUnits) &&
      current.compilerLimits.maxCanonicalUnits > 0 &&
      current.compilerLimits.maxCanonicalUnits <= 100_000 &&
      keys(
        current.retrievalPolicy,
        [
          'minimumTrustBps',
          'trustBpsByAdapter',
          'maxAgeMsBySourceClass',
          'conflictKeyBySourceReference',
        ],
        ['minimumTrustBps', 'trustBpsByAdapter', 'maxAgeMsBySourceClass'],
      ),
  );
  if (query.deadline !== undefined) {
    requireValue(
      keys(query.deadline, ['deadlineAt']) &&
        timestamp(query.deadline.deadlineAt) === binding.deadlineMs,
    );
  }
  if (policy.jurisdictionRestrictions !== undefined) {
    requireValue(
      Array.isArray(policy.jurisdictionRestrictions) &&
        policy.jurisdictionRestrictions.length <= 32,
    );
    for (const restriction of policy.jurisdictionRestrictions)
      requireValue(
        keys(
          restriction,
          ['kind', 'jurisdiction', 'effect', 'purposeIds', 'reasonReference', 'version'],
          ['kind', 'jurisdiction', 'effect', 'reasonReference', 'version'],
        ) &&
          restriction.kind === 'JurisdictionRestriction' &&
          ['ALLOW', 'DENY'].includes(restriction.effect) &&
          text(restriction.jurisdiction) &&
          text(restriction.reasonReference) &&
          text(restriction.version) &&
          (restriction.purposeIds === undefined || stringArray(restriction.purposeIds)),
      );
  }
  const consent = consentFor(current, now);
  const lookup = lookupCurrentPolicy(
    {
      kind: 'CurrentPolicyLookupRequest',
      schemaVersion: query.schemaVersion,
      expectedPolicy: policy.policy,
      correlation: query.correlation,
      evaluatedAt: at(now),
      tenant: query.tenant,
      actor: query.actor,
    },
    { getCurrent: (request) => validPolicySnapshot(owner.policy.getCurrent(request)) },
  );
  requireValue(
    lookup.found &&
      lookup.state === 'ACTIVE' &&
      !lookup.versionChanged &&
      same(lookup.currentPolicy, policy.policy),
  );
  const evaluation: InformationalPolicyEvaluationRequest = {
    ...policy,
    snapshot: lookup.snapshot,
    evaluatedAt: at(now),
    ...(consent === undefined ? {} : { consent }),
  };
  const precheck = precheckPolicy({ kind: 'PolicyPrecheckRequest', policyEvaluation: evaluation });
  requireValue(
    precheck.decision === 'ALLOW' &&
      !precheck.approvalRequired &&
      !precheck.requiredAuthority.required &&
      precheck.authorizesExecution === false &&
      precheck.informationalOnly === true,
  );
  return { record: current, policy: lookup.snapshot };
}

function adapterCaptures(owner: CurrentPublicModelContextOwner): readonly AdapterCapture[] {
  requireValue(
    Array.isArray(owner.adapters) && owner.adapters.length > 0 && owner.adapters.length <= 4,
  );
  const result: AdapterCapture[] = [];
  for (let index = 0; index < owner.adapters.length; index += 1) {
    const entry = Object.getOwnPropertyDescriptor(owner.adapters, String(index));
    requireValue(entry && 'value' in entry && record(entry.value));
    const adapter = entry.value as unknown as ContextSourceAdapter;
    const descriptor = Object.getOwnPropertyDescriptor(adapter, 'descriptor');
    const read = Object.getOwnPropertyDescriptor(adapter, 'read');
    requireValue(
      descriptor &&
        'value' in descriptor &&
        read &&
        'value' in read &&
        typeof read.value === 'function',
    );
    const projected = capture(descriptor.value) as ContextSourceAdapter['descriptor'];
    requireValue(
      keys(projected, [
        'adapterId',
        'sourceClass',
        'readOnly',
        'supportedSelectorKeys',
        'maxItemsPerRead',
      ]) &&
        token(projected.adapterId) &&
        projected.readOnly === true &&
        projected.sourceClass === 'COMPANY_KNOWLEDGE' &&
        stringArray(projected.supportedSelectorKeys) &&
        Number.isSafeInteger(projected.maxItemsPerRead) &&
        projected.maxItemsPerRead >= 1 &&
        projected.maxItemsPerRead <= 4,
    );
    result.push({
      descriptor: projected,
      adapter,
      read: read.value as ContextSourceAdapter['read'],
    });
  }
  return result;
}
function sameAdapters(left: readonly AdapterCapture[], right: readonly AdapterCapture[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const peer = right[index];
      return (
        peer !== undefined &&
        item.adapter === peer.adapter &&
        item.read === peer.read &&
        same(item.descriptor, peer.descriptor)
      );
    })
  );
}
function sourceItem(
  value: unknown,
  binding: PublicModelContextBinding,
  now: number,
): ContextSourceItem {
  const item = capture(value) as ContextSourceItem;
  requireValue(
    keys(
      item,
      [
        'sourceReference',
        'sourceRevision',
        'tenant',
        'subject',
        'classification',
        'observedAt',
        'provenanceReference',
        'payload',
      ],
      [
        'sourceReference',
        'sourceRevision',
        'tenant',
        'classification',
        'observedAt',
        'provenanceReference',
        'payload',
      ],
    ) &&
      token(item.sourceReference) &&
      text(item.sourceRevision) &&
      item.tenant?.tenantId === binding.tenantId &&
      item.classification === 'PUBLIC' &&
      timestamp(item.observedAt) <= now &&
      text(item.provenanceReference) &&
      text(item.payload, 1_024) &&
      new TextEncoder().encode(item.payload).byteLength <= 1_024,
  );
  return item;
}

function registerCurrentContextWork(
  registerWork: (work: Promise<unknown>) => void,
  work: Promise<unknown>,
): void {
  if (typeof registerWork !== 'function') throw new Error('INVALID_WORK_OBSERVER');
  const returned: unknown = registerWork(work);
  if (returned === undefined) return;
  try {
    void Promise.prototype.then.call(
      returned,
      () => undefined,
      () => undefined,
    );
  } catch {
    /* Reject thenables without reading their accessors. */
  }
  throw new Error('ASYNCHRONOUS_WORK_OBSERVER');
}

/**
 * Actual W02/W06 producer composition, kept leaf-private and inactive by default.
 * It retains only one bounded preparation capture, never current owner truth.
 * A timed-out/cancelled read remains BUSY until its real underlying promise settles.
 */
export class CurrentPublicModelContext {
  readonly #owner: CurrentPublicModelContextOwner | undefined;
  readonly #now: () => number;
  #busy = false;
  #sequence = 0;
  #prepared: Prepared | null = null;

  constructor(dependencies: {
    readonly now: () => number;
    readonly owner?: CurrentPublicModelContextOwner;
  }) {
    this.#now = dependencies.now;
    this.#owner = dependencies.owner;
  }

  prepareCurrent(
    bindingInput: PublicModelContextBinding,
    signal: AbortSignal,
    registerWork?: (work: Promise<unknown>) => void,
  ): Promise<CurrentPublicModelContextPreparation | null> {
    let binding: PublicModelContextBinding;
    let started: number;
    try {
      if (this.#busy || !this.#owner) return Promise.resolve(null);
      binding = bound(bindingInput);
      started = this.#now();
      requireValue(
        time(started) &&
          !aborted(signal) &&
          binding.deadlineMs > started &&
          binding.deadlineMs - started <= MAX_REQUEST_MS,
      );
    } catch {
      return Promise.resolve(null);
    }
    this.#busy = true;
    this.#prepared = null;
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (value: CurrentPublicModelContextPreparation | null): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        try {
          EventTarget.prototype.removeEventListener.call(signal, 'abort', onAbort);
        } catch {
          /* cleanup only */
        }
        resolve(value);
      };
      const onAbort = (): void => {
        this.#prepared = null;
        finish(null);
      };
      try {
        EventTarget.prototype.addEventListener.call(signal, 'abort', onAbort, { once: true });
        if (aborted(signal)) {
          this.#busy = false;
          finish(null);
          return;
        }
        timer = setTimeout(
          () => {
            this.#prepared = null;
            finish(null);
          },
          Math.min(MAX_AGE_MS, binding.deadlineMs - started),
        );
      } catch {
        this.#busy = false;
        finish(null);
        return;
      }
      let admitted = false;
      // This fence owns the actual acquisition and finalization, not finish(null)
      // from cancellation/TTL. Admission precedes the first adapter/owner call.
      const work = Promise.resolve()
        .then(() => {
          if (!admitted) throw new Error('CURRENT_CONTEXT_WORK_NOT_ADMITTED');
          return this.#produce(binding, signal, started, () => settled);
        })
        .then(
          (prepared) => {
            this.#busy = false;
            if (settled) return;
            try {
              if (prepared === null) {
                finish(null);
                return;
              }
              this.#prepared = prepared;
              if (!this.isCurrent(prepared.result.contextRef, binding, this.#now())) {
                this.#prepared = null;
                finish(null);
                return;
              }
              finish(prepared.result);
            } catch {
              this.#prepared = null;
              finish(null);
            }
          },
          () => {
            this.#busy = false;
            finish(null);
          },
        );
      try {
        if (registerWork !== undefined) {
          registerCurrentContextWork(registerWork, work);
        }
        admitted = true;
      } catch {
        // The denied gated task still has a terminal handler queued. Let that
        // sole handler release BUSY, so it cannot release a newer preparation.
        finish(null);
      }
    });
  }

  async revalidateCurrent(
    contextRef: string,
    binding: PublicModelContextBinding,
    nowEpochMs: number,
    signal: AbortSignal,
    registerWork?: (work: Promise<unknown>) => void,
  ): Promise<boolean> {
    let admitted = false;
    const work = Promise.resolve().then(() => {
      if (!admitted) return false;
      try {
        return !aborted(signal) && this.isCurrent(contextRef, binding, nowEpochMs);
      } catch {
        return false;
      }
    });
    try {
      if (registerWork !== undefined) {
        registerCurrentContextWork(registerWork, work);
      }
      admitted = true;
      return await work;
    } catch {
      return false;
    }
  }

  isCurrent(
    contextRef: string,
    bindingInput: PublicModelContextBinding,
    nowEpochMs: number,
  ): boolean {
    const prepared = this.#prepared;
    if (!prepared || this.#busy || contextRef !== prepared.result.contextRef) return false;
    try {
      const binding = bound(bindingInput);
      if (!same(binding, prepared.result.binding)) return false;
      const observed = this.#now();
      requireValue(time(observed) && time(nowEpochMs));
      const now = Math.max(observed, nowEpochMs);
      requireValue(
        observed >= prepared.lastCheckedAt &&
          nowEpochMs >= prepared.result.observedAtEpochMs &&
          now < prepared.result.expiresAtEpochMs &&
          !aborted(prepared.signal),
      );
      prepared.lastCheckedAt = now;
      requireValue(this.#matches(prepared.inputs, prepared.adapters, binding, now));
      for (const source of prepared.sources)
        requireValue(this.#sourceMatches(source, binding, now));
      const retrieval = evaluateContextRetrieval({
        query: prepared.inputs.record.query,
        acquisition: prepared.acquisition,
        policy: { ...prepared.inputs.record.retrievalPolicy, evaluatedAt: at(now) },
      });
      requireValue(
        retrieval.rejections.length === 0 &&
          retrieval.upstreamRejections.length === 0 &&
          retrieval.items.length === prepared.sources.length &&
          retrieval.items.every(
            (item) =>
              item.retrieval.freshness.state === 'CURRENT' &&
              item.retrieval.conflict.state === 'NONE' &&
              item.retrieval.uncertainty.length === 0,
          ),
      );
      const after = this.#now();
      requireValue(
        time(after) &&
          after >= observed &&
          after < prepared.result.expiresAtEpochMs &&
          !aborted(prepared.signal),
      );
      return true;
    } catch {
      this.#prepared = null;
      return false;
    }
  }

  #matches(
    initial: Inputs,
    adapters: readonly AdapterCapture[],
    binding: PublicModelContextBinding,
    now: number,
  ): boolean {
    if (!this.#owner) return false;
    return (
      same(inputs(this.#owner, binding, now), initial) &&
      sameAdapters(adapterCaptures(this.#owner), adapters)
    );
  }
  #sourceMatches(source: SourceCapture, binding: PublicModelContextBinding, now: number): boolean {
    if (!this.#owner) return false;
    return same(
      sourceItem(
        this.#owner.readCurrentSource(binding, source.adapterId, source.item.sourceReference),
        binding,
        now,
      ),
      source.item,
    );
  }

  async #produce(
    binding: PublicModelContextBinding,
    signal: AbortSignal,
    started: number,
    stopped: () => boolean,
  ): Promise<Prepared | null> {
    const owner = this.#owner;
    if (!owner || stopped() || aborted(signal)) return null;
    const initial = inputs(owner, binding, started);
    const adapters = adapterCaptures(owner);
    const sources: SourceCapture[] = [];
    let last = started;
    const current = (): number => {
      const now = this.#now();
      requireValue(
        time(now) &&
          now >= last &&
          now < initial.record.expiresAtEpochMs &&
          now - started < MAX_AGE_MS &&
          !stopped() &&
          !aborted(signal),
      );
      last = now;
      requireValue(this.#matches(initial, adapters, binding, now));
      return now;
    };
    const guarded: ContextSourceAdapter[] = adapters.map((entry) => ({
      descriptor: entry.descriptor,
      read: async (request) => {
        current();
        const raw = await entry.read.call(entry.adapter, request);
        const now = current();
        const result = capture(raw) as {
          readonly items: readonly ContextSourceItem[];
          readonly truncated?: boolean;
        };
        requireValue(
          keys(result, ['items', 'truncated'], ['items']) &&
            Array.isArray(result.items) &&
            (result.truncated === undefined || result.truncated === false) &&
            result.items.length <= request.limit,
        );
        const items = result.items.map((item) => sourceItem(item, binding, now));
        requireValue(sources.length + items.length <= 4);
        for (const item of items) {
          const captured = { adapterId: entry.descriptor.adapterId, item };
          requireValue(this.#sourceMatches(captured, binding, now));
          sources.push(captured);
        }
        return { items };
      },
    }));
    const acquisition = capture(
      await acquireContextCandidates({ query: initial.record.query, adapters: guarded }),
    ) as ContextAcquisitionResult;
    const now = current();
    requireValue(
      acquisition.rejections.length === 0 &&
        acquisition.items.length > 0 &&
        acquisition.items.length === sources.length &&
        sources.every((source) => this.#sourceMatches(source, binding, now)),
    );
    const retrieval = evaluateContextRetrieval({
      query: initial.record.query,
      acquisition,
      policy: { ...initial.record.retrievalPolicy, evaluatedAt: at(now) },
    });
    const compiled = compileMinimalContext({
      query: initial.record.query,
      retrieval,
      limits: initial.record.compilerLimits,
    });
    const prompt = compilePublicLocalModelPrompt({
      compiled,
      tenantId: binding.tenantId,
      correlationId: binding.correlationId,
      instruction: initial.record.instruction,
      allowedAdapterIds: initial.record.allowedAdapterIds,
      nowEpochMs: now,
      maxAgeMs: MAX_AGE_MS,
      maxPromptBytes: 8_192,
      maxItems: initial.record.compilerLimits.maxItems,
    });
    requireValue(
      prompt.status === 'READY' &&
        !prompt.includedSourceReferences.some((ref) => prompt.prompt.includes(ref)),
    );
    current();
    this.#sequence += 1;
    const result = capture({
      kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_PREPARATION',
      binding,
      contextRef: 'w06.public-context:' + String(this.#sequence),
      observedAtEpochMs: started,
      expiresAtEpochMs: Math.min(
        initial.record.expiresAtEpochMs,
        started + MAX_AGE_MS,
        binding.deadlineMs,
      ),
      minimizedPublicPrompt: prompt,
    }) as CurrentPublicModelContextPreparation;
    return { result, inputs: initial, adapters, sources, acquisition, signal, lastCheckedAt: now };
  }
}
