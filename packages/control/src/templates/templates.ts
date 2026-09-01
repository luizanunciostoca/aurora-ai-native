import type {
  BindPlanTemplateResult,
  CreatePlanTemplateInput,
  CreatePlanTemplateResult,
  PlanBindingSelection,
  PlanTemplate,
  PlanTemplateBindingInput,
  PlanTemplateMatchCriteria,
  PlanTemplateRequirementCompatibility,
} from './types.ts';

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function equalMatchCriteria(
  left: PlanTemplateMatchCriteria,
  right: PlanTemplateMatchCriteria,
): boolean {
  return (
    left.intentKind === right.intentKind &&
    left.taskKind === right.taskKind &&
    left.inputContractVersion === right.inputContractVersion
  );
}

function validRequirement(requirement: PlanTemplateRequirementCompatibility): boolean {
  return (
    nonEmpty(requirement.requirementId) &&
    nonEmpty(requirement.capabilityId) &&
    requirement.allowedCapabilityVersions.length > 0 &&
    requirement.allowedCapabilityVersions.every(nonEmpty) &&
    new Set(requirement.allowedCapabilityVersions).size ===
      requirement.allowedCapabilityVersions.length &&
    requirement.requiredCompatibilityKeys.every(nonEmpty) &&
    new Set(requirement.requiredCompatibilityKeys).size ===
      requirement.requiredCompatibilityKeys.length
  );
}

function canonicalRequirement(
  requirement: PlanTemplateRequirementCompatibility,
): PlanTemplateRequirementCompatibility {
  return {
    requirementId: requirement.requirementId,
    capabilityId: requirement.capabilityId,
    allowedCapabilityVersions: [...requirement.allowedCapabilityVersions].sort(),
    requiredCompatibilityKeys: [...requirement.requiredCompatibilityKeys].sort(),
  };
}

export function createPlanTemplate(input: CreatePlanTemplateInput): CreatePlanTemplateResult {
  if (!nonEmpty(input.templateId)) return { status: 'REJECTED', code: 'INVALID_TEMPLATE_ID' };
  if (!nonEmpty(input.semanticVersion)) {
    return { status: 'REJECTED', code: 'INVALID_SEMANTIC_VERSION' };
  }
  if (!SHA256_PATTERN.test(input.contentHash)) {
    return { status: 'REJECTED', code: 'INVALID_CONTENT_HASH' };
  }

  const invalidationReason = input.invalidationReason?.trim();
  if (
    (input.status === 'ACTIVE' &&
      invalidationReason !== undefined &&
      invalidationReason.length > 0) ||
    (input.status === 'INVALIDATED' &&
      (invalidationReason === undefined || invalidationReason.length === 0))
  ) {
    return { status: 'REJECTED', code: 'INVALID_STATUS_METADATA' };
  }

  if (
    !nonEmpty(input.match.intentKind) ||
    !nonEmpty(input.match.taskKind) ||
    !nonEmpty(input.match.inputContractVersion)
  ) {
    return { status: 'REJECTED', code: 'INVALID_MATCH_CRITERIA' };
  }

  if (
    input.provenance.sourceKind !== 'AURORA_CURATED' ||
    !nonEmpty(input.provenance.sourceRef) ||
    !nonEmpty(input.provenance.curatedBy) ||
    !validIsoTimestamp(input.provenance.curatedAt)
  ) {
    return { status: 'REJECTED', code: 'INVALID_PROVENANCE' };
  }

  if (input.compatibility.requirements.length === 0 || input.requirementOrder.length === 0) {
    return { status: 'REJECTED', code: 'EMPTY_REQUIREMENTS' };
  }
  if (!input.compatibility.requirements.every(validRequirement)) {
    return { status: 'REJECTED', code: 'INVALID_COMPATIBILITY' };
  }

  const requirementIds = input.compatibility.requirements.map(
    (requirement) => requirement.requirementId,
  );
  if (new Set(requirementIds).size !== requirementIds.length) {
    return { status: 'REJECTED', code: 'DUPLICATE_REQUIREMENT_ID' };
  }

  if (
    input.requirementOrder.some((requirementId) => !nonEmpty(requirementId)) ||
    new Set(input.requirementOrder).size !== input.requirementOrder.length ||
    input.requirementOrder.length !== requirementIds.length ||
    input.requirementOrder.some((requirementId) => !requirementIds.includes(requirementId))
  ) {
    return { status: 'REJECTED', code: 'INVALID_REQUIREMENT_ORDER' };
  }

  if (
    input.compatibility.registryVersions.length === 0 ||
    input.compatibility.registryVersions.some((version) => !nonEmpty(version)) ||
    new Set(input.compatibility.registryVersions).size !== input.compatibility.registryVersions.length
  ) {
    return { status: 'REJECTED', code: 'INVALID_COMPATIBILITY' };
  }

  if (
    input.invalidationConditions.length === 0 ||
    new Set(input.invalidationConditions).size !== input.invalidationConditions.length
  ) {
    return { status: 'REJECTED', code: 'INVALID_INVALIDATION_CONDITIONS' };
  }

  const template: PlanTemplate = {
    templateKind: 'AURORA_CURATED_PLAN_TEMPLATE',
    templateId: input.templateId,
    semanticVersion: input.semanticVersion,
    contentHash: input.contentHash,
    status: input.status,
    ...(input.status === 'INVALIDATED' ? { invalidationReason } : {}),
    match: { ...input.match },
    requirementOrder: [...input.requirementOrder],
    compatibility: {
      registryVersions: [...input.compatibility.registryVersions].sort(),
      requirements: input.compatibility.requirements
        .map(canonicalRequirement)
        .sort((left, right) => left.requirementId.localeCompare(right.requirementId)),
    },
    invalidationConditions: [...input.invalidationConditions].sort(),
    provenance: { ...input.provenance },
    authorizesExecution: false,
    adaptivePromotion: false,
  };

  return { status: 'CREATED', template };
}

export function bindPlanTemplate(input: PlanTemplateBindingInput): BindPlanTemplateResult {
  const { template, capabilityPlan, registry } = input;

  if (template.status !== 'ACTIVE') {
    return { status: 'REJECTED', code: 'TEMPLATE_INVALIDATED' };
  }
  if (input.expectedContentHash !== template.contentHash) {
    return { status: 'REJECTED', code: 'CONTENT_HASH_MISMATCH' };
  }
  if (!equalMatchCriteria(template.match, input.match)) {
    return { status: 'REJECTED', code: 'MATCH_CRITERIA_MISMATCH' };
  }
  if (capabilityPlan.tenantId !== input.tenantId) {
    return { status: 'REJECTED', code: 'TENANT_MISMATCH' };
  }
  if (capabilityPlan.correlationId !== input.correlationId) {
    return { status: 'REJECTED', code: 'CORRELATION_MISMATCH' };
  }
  if (capabilityPlan.status !== 'READY') {
    return { status: 'REJECTED', code: 'CAPABILITY_PLAN_NOT_READY' };
  }
  if (capabilityPlan.registryVersion !== registry.registryVersion) {
    return { status: 'REJECTED', code: 'REGISTRY_SNAPSHOT_MISMATCH' };
  }
  if (!template.compatibility.registryVersions.includes(registry.registryVersion)) {
    return { status: 'REJECTED', code: 'REGISTRY_VERSION_INCOMPATIBLE' };
  }

  const compatibilityByRequirement = new Map(
    template.compatibility.requirements.map((requirement) => [
      requirement.requirementId,
      requirement,
    ]),
  );
  const selections: PlanBindingSelection[] = [];

  for (const requirementId of template.requirementOrder) {
    const compatibility = compatibilityByRequirement.get(requirementId);
    if (compatibility === undefined) {
      return { status: 'REJECTED', code: 'REQUIREMENT_NOT_SELECTED', requirementId };
    }

    const selection = capabilityPlan.selections.find(
      (candidate) => candidate.requirementId === requirementId,
    );
    if (selection === undefined || selection.status !== 'SELECTED') {
      return { status: 'REJECTED', code: 'REQUIREMENT_NOT_SELECTED', requirementId };
    }
    if (selection.capabilityId !== compatibility.capabilityId) {
      return {
        status: 'REJECTED',
        code: 'CAPABILITY_MISMATCH',
        requirementId,
        capabilityId: selection.capabilityId,
      };
    }

    const descriptor = registry.entries.find(
      (entry) => entry.capabilityId === compatibility.capabilityId,
    );
    if (descriptor === undefined) {
      return {
        status: 'REJECTED',
        code: 'CAPABILITY_NOT_FOUND',
        requirementId,
        capabilityId: compatibility.capabilityId,
      };
    }
    if (!compatibility.allowedCapabilityVersions.includes(descriptor.semanticVersion)) {
      return {
        status: 'REJECTED',
        code: 'CAPABILITY_VERSION_INCOMPATIBLE',
        requirementId,
        capabilityId: compatibility.capabilityId,
      };
    }

    const missingCompatibilityKey = compatibility.requiredCompatibilityKeys.find(
      (key) => !descriptor.compatibilityKeys.includes(key),
    );
    if (missingCompatibilityKey !== undefined) {
      return {
        status: 'REJECTED',
        code: 'COMPATIBILITY_KEY_MISSING',
        requirementId,
        capabilityId: compatibility.capabilityId,
        compatibilityKey: missingCompatibilityKey,
      };
    }

    selections.push({
      requirementId,
      capabilityId: descriptor.capabilityId,
      capabilityVersion: descriptor.semanticVersion,
      selectedBindingIds: [...selection.selectedBindingIds].sort(),
    });
  }

  return {
    status: 'BOUND',
    binding: {
      bindingKind: 'AURORA_CURATED_PLAN_BINDING',
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      templateRef: {
        templateId: template.templateId,
        semanticVersion: template.semanticVersion,
        contentHash: template.contentHash,
        provenanceRef: template.provenance.sourceRef,
      },
      registryVersion: registry.registryVersion,
      requirementOrder: [...template.requirementOrder],
      selections,
      mandatoryValidations: [
        'CURRENT_CAPABILITY',
        'CURRENT_POLICY',
        'CURRENT_AUTHORITY',
        'EXECUTOR_PRECONDITIONS',
      ],
      authorizesExecution: false,
      adaptivePromotion: false,
    },
  };
}
