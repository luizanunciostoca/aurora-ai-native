import type { IdentityId, TenantId } from '@aurora/contracts/ids';

declare const auroraDeviceIdBrand: unique symbol;

/**
 * W14 canonical registered-device identifier.
 *
 * Shared/root namespace publication remains a Program Control surface; this
 * W14-owned leaf is the single runtime source for device registration identity.
 */
export type DeviceId = string & {
  readonly [auroraDeviceIdBrand]: 'DeviceId';
};

export const DEVICE_LIFECYCLE_STATES = [
  'REGISTERED',
  'ACTIVE',
  'REVOKED',
  'COMPROMISED',
  'RETIRED',
] as const;
export type DeviceLifecycleState = (typeof DEVICE_LIFECYCLE_STATES)[number];

export interface DeviceRef {
  readonly kind: 'AURORA_DEVICE';
  readonly deviceId: DeviceId;
  readonly tenantId: TenantId;
  readonly registrationVersion: number;
}

export interface DeviceRegistrationProvenance {
  readonly source: 'W14_DEVICE_REGISTRATION';
  readonly reference: string;
  readonly observedAt: string;
}

export interface DeviceRegistrationRecord {
  readonly kind: 'DeviceRegistrationRecord';
  readonly schemaVersion: '1.0.0';
  readonly ref: DeviceRef;
  readonly boundIdentityId?: IdentityId;
  readonly state: DeviceLifecycleState;
  readonly registeredAt: string;
  readonly updatedAt: string;
  readonly provenance: DeviceRegistrationProvenance;
  readonly authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface DeviceRegistrationRequest {
  readonly deviceId: DeviceId;
  readonly tenantId: TenantId;
  readonly boundIdentityId?: IdentityId;
  readonly registeredAt: string;
  readonly provenance: DeviceRegistrationProvenance;
  /** Required only when explicitly re-registering a revoked device. */
  readonly expectedVersion?: number;
}

export type DeviceReregistrationPolicy =
  | 'DENY_AFTER_REVOCATION'
  | 'ALLOW_SAME_BINDING_AFTER_REVOCATION';

export type DeviceRegistrationError =
  | 'REQUEST_MALFORMED'
  | 'DEVICE_ID_INVALID'
  | 'TENANT_ID_INVALID'
  | 'IDENTITY_ID_INVALID'
  | 'PROVENANCE_INVALID'
  | 'CROSS_TENANT'
  | 'IDENTITY_BINDING_MISMATCH'
  | 'STALE_VERSION'
  | 'REREGISTRATION_DENIED'
  | 'DEVICE_COMPROMISED'
  | 'DEVICE_RETIRED';

export type DeviceRegistrationResult =
  | {
      readonly ok: true;
      readonly disposition: 'REGISTERED' | 'ALREADY_REGISTERED' | 'REREGISTERED';
      readonly record: DeviceRegistrationRecord;
      readonly authorizesExecution: false;
    }
  | {
      readonly ok: false;
      readonly error: DeviceRegistrationError;
      readonly authorizesExecution: false;
    };

export type DeviceTransition = 'ACTIVATE' | 'REVOKE' | 'MARK_COMPROMISED' | 'RETIRE';

export interface DeviceTransitionRequest {
  readonly ref: DeviceRef;
  readonly expectedVersion: number;
  readonly transitionedAt: string;
  readonly provenance: DeviceRegistrationProvenance;
}

export type DeviceTransitionError =
  | 'REQUEST_MALFORMED'
  | 'DEVICE_REF_INVALID'
  | 'DEVICE_NOT_FOUND'
  | 'CROSS_TENANT'
  | 'STALE_VERSION'
  | 'TRANSITION_NOT_ALLOWED';

export type DeviceTransitionResult =
  | {
      readonly ok: true;
      readonly transition: DeviceTransition;
      readonly record: DeviceRegistrationRecord;
      readonly authorizesExecution: false;
    }
  | {
      readonly ok: false;
      readonly error: DeviceTransitionError;
      readonly authorizesExecution: false;
    };

export interface ResolveDeviceRequest {
  readonly ref: DeviceRef;
  readonly boundIdentityId?: IdentityId;
}

export type DeviceResolutionError =
  | 'REQUEST_MALFORMED'
  | 'DEVICE_REF_INVALID'
  | 'DEVICE_NOT_FOUND'
  | 'CROSS_TENANT'
  | 'IDENTITY_BINDING_MISMATCH'
  | 'STALE_VERSION'
  | 'DEVICE_NOT_ACTIVE'
  | 'DEVICE_REVOKED'
  | 'DEVICE_COMPROMISED'
  | 'DEVICE_RETIRED';

export type DeviceResolutionResult =
  | {
      readonly ok: true;
      readonly record: DeviceRegistrationRecord;
      readonly authorizesExecution: false;
      readonly canGrantPermission: false;
    }
  | {
      readonly ok: false;
      readonly error: DeviceResolutionError;
      readonly authorizesExecution: false;
      readonly canGrantPermission: false;
    };
