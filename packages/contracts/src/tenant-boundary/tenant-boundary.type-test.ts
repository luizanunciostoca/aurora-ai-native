import type { IdentityId, TenantId } from '../ids/types';
import type { IdentityTenantBinding, TenantBoundaryCheck } from './types';

declare const tenantId: TenantId;
declare const identityId: IdentityId;
declare const binding: IdentityTenantBinding;

declare const check: TenantBoundaryCheck;
void check;
void binding;

const canonicalTenant: TenantId = tenantId;
const canonicalIdentity: IdentityId = identityId;
void canonicalTenant;
void canonicalIdentity;

// @ts-expect-error TenantId and IdentityId remain distinct W01 canonical brands.
const wrongTenant: TenantId = identityId;
void wrongTenant;

// @ts-expect-error Tenant boundary APIs must not accept a plain string as TenantId.
const plainTenant: TenantId = 'tenant-default';
void plainTenant;
