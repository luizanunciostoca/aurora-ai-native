import type { ActionIntent } from '@aurora/contracts/actions';
import type { DeviceExecutionTargetReference } from '@aurora/contracts/execution-target';

import type { DeviceResolutionResult, ResolveDeviceRequest } from '../device/types.js';

const MAX_BINDING_ID_LENGTH = 256;

export interface CurrentDeviceRegistrationReader {
  resolve(request: ResolveDeviceRequest): DeviceResolutionResult;
}

export interface LocalCurrentVoiceTargetBindingRequest {
  readonly actionIntent: ActionIntent;
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
  readonly evaluatedAt: string;
}

export interface LocalExecutableDeviceTargetBinding {
  readonly schemaVersion: ActionIntent['schemaVersion'];
  readonly bindingId: string;
  readonly tenant: ActionIntent['tenant'];
  readonly target: DeviceExecutionTargetReference;
  readonly state: 'AVAILABLE';
  readonly compatibleActionIntentSchemaVersions: readonly ActionIntent['schemaVersion'][];
  readonly preconditionsSatisfied: true;
}

export interface LocalCurrentVoiceTargetBindingSource {
  resolve(
    request: LocalCurrentVoiceTargetBindingRequest,
  ): readonly LocalExecutableDeviceTargetBinding[] | null;
}

function validEvaluatedAt(value: string): boolean {
  return value.length > 0 && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function bindingId(deviceId: string, registrationVersion: number): string | null {
  const value = `w14:device:${deviceId}:v${registrationVersion}`;
  return value.length <= MAX_BINDING_ID_LENGTH ? value : null;
}

/**
 * W14-owned current DEVICE target availability adapter for W07 target resolution.
 *
 * A successful active registration is precondition metadata only. It never proves device-session
 * trust, grants permission, authorizes execution, proves an outcome, or permits retry. W14 dispatch
 * still revalidates gateway/device-session/attestation truth immediately before transport.
 */
export class W14CurrentDeviceTargetBindingSource implements LocalCurrentVoiceTargetBindingSource {
  readonly #devices: CurrentDeviceRegistrationReader;

  constructor(devices: CurrentDeviceRegistrationReader) {
    this.#devices = devices;
  }

  resolve(
    request: LocalCurrentVoiceTargetBindingRequest,
  ): readonly LocalExecutableDeviceTargetBinding[] | null {
    const target = request.actionIntent.executionTarget;
    if (
      target?.kind !== 'DEVICE' ||
      target.bindingReference !== request.deviceId ||
      request.actionIntent.tenant.tenantId !== request.tenantId ||
      request.actionIntent.actor.identityId !== request.actorIdentityId ||
      !Number.isSafeInteger(request.registrationVersion) ||
      request.registrationVersion < 1 ||
      !validEvaluatedAt(request.evaluatedAt)
    ) {
      return [];
    }

    let resolved: DeviceResolutionResult;
    try {
      resolved = this.#devices.resolve({
        ref: {
          kind: 'AURORA_DEVICE',
          deviceId: request.deviceId as ResolveDeviceRequest['ref']['deviceId'],
          tenantId: request.actionIntent.tenant.tenantId,
          registrationVersion: request.registrationVersion,
        },
        boundIdentityId: request.actionIntent.actor.identityId,
      });
    } catch {
      return null;
    }
    if (!resolved.ok) return [];

    const record = resolved.record;
    if (
      resolved.authorizesExecution !== false ||
      resolved.canGrantPermission !== false ||
      record.authorizesExecution !== false ||
      record.canGrantPermission !== false ||
      record.state !== 'ACTIVE' ||
      record.ref.deviceId !== request.deviceId ||
      record.ref.tenantId !== request.actionIntent.tenant.tenantId ||
      record.ref.registrationVersion !== request.registrationVersion ||
      record.boundIdentityId !== request.actionIntent.actor.identityId ||
      Date.parse(record.updatedAt) > Date.parse(request.evaluatedAt)
    ) {
      return [];
    }

    const id = bindingId(record.ref.deviceId, record.ref.registrationVersion);
    if (id === null) return null;
    return [
      Object.freeze({
        schemaVersion: request.actionIntent.schemaVersion,
        bindingId: id,
        tenant: request.actionIntent.tenant,
        target: target as DeviceExecutionTargetReference,
        state: 'AVAILABLE' as const,
        compatibleActionIntentSchemaVersions: [request.actionIntent.schemaVersion],
        preconditionsSatisfied: true as const,
      }),
    ];
  }
}
