import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('consumer can resolve root packages and governed subpaths', () => {
  const contracts = require('@aurora/contracts');
  const contractIds = require('@aurora/contracts/ids');
  const contractIdentityResolution = require('@aurora/contracts/identity-resolution');
  const contractPolicyEngine = require('@aurora/contracts/policy-engine');
  const contractPolicyQuery = require('@aurora/contracts/policy-query');
  const contractPolicyValidation = require('@aurora/contracts/policy-validation');
  const contractResults = require('@aurora/contracts/results');
  const contractTenantBoundary = require('@aurora/contracts/tenant-boundary');

  const schemas = require('@aurora/schemas');
  const schemaConsent = require('@aurora/schemas/consent');
  const schemaIdentityResolution = require('@aurora/schemas/identity-resolution');
  const schemaIds = require('@aurora/schemas/ids');
  const schemaJurisdiction = require('@aurora/schemas/jurisdiction');
  const schemaPolicyEngine = require('@aurora/schemas/policy-engine');
  const schemaPolicyQuery = require('@aurora/schemas/policy-query');
  const schemaPolicyValidation = require('@aurora/schemas/policy-validation');
  const schemaPurpose = require('@aurora/schemas/purpose');
  const schemaTenantBoundary = require('@aurora/schemas/tenant-boundary');

  const registries = require('@aurora/registries');
  const registryIds = require('@aurora/registries/ids');
  const registryPolicy = require('@aurora/registries/policy');
  const registryVersions = require('@aurora/registries/versioning');

  const policyCore = require('@aurora/policy-core');
  const policyAuthority = require('@aurora/policy-core/authority');
  const policyQuery = require('@aurora/policy-core/query');

  assert.equal(contracts.COMMAND_ENVELOPE_KIND, 'COMMAND');
  assert.equal(contracts.EVENT_ENVELOPE_KIND, 'EVENT');
  assert.equal(contractIds.CANONICAL_ID_GENERATION_RESPONSIBILITY, 'PRODUCER');
  assert.ok(Array.isArray(contractIdentityResolution.IDENTITY_RESOLUTION_STATUSES));
  assert.ok(Array.isArray(contractPolicyEngine.POLICY_EVALUATION_DECISIONS));
  assert.ok(Array.isArray(contractPolicyQuery.POLICY_QUERY_REASONS));
  assert.ok(Array.isArray(contracts.POLICY_QUERY_REASONS));
  assert.ok(Array.isArray(contractPolicyValidation.AUTHORITY_VALIDATION_REASONS));
  assert.ok(Array.isArray(contracts.AUTHORITY_VALIDATION_REASONS));
  assert.ok(Array.isArray(contractResults.EXECUTION_OUTCOMES));
  assert.ok(Array.isArray(contractTenantBoundary.TENANT_BOUNDARY_REASONS));

  assert.equal(typeof schemas.TenantIdSchema.parse, 'function');
  assert.equal(typeof schemaConsent.ConsentRecordSchema.parse, 'function');
  assert.equal(typeof schemaIdentityResolution.IdentityResolutionRequestSchema.parse, 'function');
  assert.equal(typeof schemaIdentityResolution.IdentityResolutionResultSchema.parse, 'function');
  assert.equal(typeof schemaIds.CorrelationIdSchema.parse, 'function');
  assert.equal(typeof schemaJurisdiction.JurisdictionContextSchema.parse, 'function');
  assert.equal(typeof schemaPolicyEngine.PolicyEvaluationRequestSchema.parse, 'function');
  assert.equal(typeof schemaPolicyEngine.PolicyEvaluationResultSchema.parse, 'function');
  assert.equal(typeof schemaPolicyQuery.CurrentPolicyLookupRequestSchema.parse, 'function');
  assert.equal(typeof schemaPolicyQuery.CurrentPolicyLookupResultSchema.parse, 'function');
  assert.equal(typeof schemaPolicyQuery.PolicyPrecheckRequestSchema.parse, 'function');
  assert.equal(typeof schemaPolicyQuery.PolicyPrecheckResultSchema.parse, 'function');
  assert.equal(typeof schemas.PolicyPrecheckRequestSchema.parse, 'function');
  assert.equal(typeof schemas.PolicyPrecheckResultSchema.parse, 'function');
  assert.equal(typeof schemaPolicyValidation.PolicyTokenValidationRequestSchema.parse, 'function');
  assert.equal(typeof schemaPolicyValidation.PolicyTokenValidationResultSchema.parse, 'function');
  assert.equal(typeof schemaPolicyValidation.AuthorityEvaluationRequestSchema.parse, 'function');
  assert.equal(typeof schemaPolicyValidation.AuthorityEvaluationResultSchema.parse, 'function');
  assert.equal(typeof schemas.AuthorityEvaluationRequestSchema.parse, 'function');
  assert.equal(typeof schemas.AuthorityEvaluationResultSchema.parse, 'function');
  assert.equal(typeof schemaPurpose.PurposeContextSchema.parse, 'function');
  assert.equal(typeof schemaTenantBoundary.TenantBoundaryContextSchema.parse, 'function');

  assert.equal(registries.ID_NAMESPACE_REGISTRY, registryIds.ID_NAMESPACE_REGISTRY);
  assert.equal(registries.CONTRACT_VERSION_REGISTRY, registryVersions.CONTRACT_VERSION_REGISTRY);
  assert.equal(
    registryPolicy.InMemoryPolicySnapshotRegistry,
    registries.InMemoryPolicySnapshotRegistry,
  );

  assert.equal(typeof policyCore.evaluatePolicy, 'function');
  assert.equal(typeof policyCore.toAuthoritySubjectReference, 'function');
  assert.equal(typeof policyAuthority.evaluateAuthority, 'function');
  assert.equal(typeof policyAuthority.validatePolicyToken, 'function');
  assert.equal(typeof policyAuthority.subjectRefToAuthoritySubjectReference, 'function');
  assert.equal(typeof policyAuthority.authoritySubjectReferenceToSubjectRef, 'function');
  assert.equal(typeof policyQuery.lookupCurrentPolicy, 'function');
  assert.equal(typeof policyQuery.precheckPolicy, 'function');
});
