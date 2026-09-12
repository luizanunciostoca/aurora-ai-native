// Copy this file OUTSIDE the repository to:
//   ~/aurora-devlab/config/trusted-w15j-provider.mjs
//
// Do not place database passwords, tokens, gateway credentials or other secrets in this file.
// The provider may read a managed secret/runtime channel available to the tablet operator, but it
// must return the EXISTING trusted W03/W07/W14 owner adapters and an already-authenticated W14
// principal. It must never mint authority merely because it runs on the tablet.

export async function createW15JLocalPhysicalHostOperatorInput() {
  throw new Error(
    'TABLET_DEVLAB_PROVIDER_NOT_CONFIGURED: bind this module to the trusted Aurora server/runtime owners before starting the physical host.',
  );

  /* Required result shape after trusted integration:
  return {
    databaseUrl: composition.databaseUrl,
    dependencies: {
      receiptEvidenceIngress: composition.receiptEvidenceIngress,
      createVoiceIntake: composition.createVoiceIntake,
      createContainmentLifecycle: composition.createContainmentLifecycle,
      createAttemptLifecycle: composition.createAttemptLifecycle,
    },
    principal: {
      tenantId: composition.principal.tenantId,
      actor: composition.principal.actor,
      correlationId: composition.principal.correlationId,
      deviceId: composition.principal.deviceId,
      deviceSessionId: composition.principal.deviceSessionId,
      authenticatedAtMs: composition.principal.authenticatedAtMs,
      authenticationExpiresAtMs: composition.principal.authenticationExpiresAtMs,
      authenticationReference: composition.principal.authenticationReference,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
  */
}
