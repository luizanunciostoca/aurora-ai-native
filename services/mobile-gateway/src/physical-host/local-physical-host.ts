import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { DeviceCommandDeliveryManager } from '../device-command-delivery/manager.js';
import { InMemoryDeviceRegistry } from '../device/registry.js';
import { DeviceReceiptIngressManager } from '../device-receipt-ingress/manager.js';
import type { W07DeviceReceiptEvidenceIngressPort } from '../device-receipt-ingress/types.js';
import { DeviceSessionTrustManager } from '../device-session/session-trust.js';
import { DeviceKeyProofVerifier } from '../gateway-auth/device-key-proof-verifier.js';
import {
  GatewayBootstrapDeliveryBroker,
  type GatewayBootstrapStageResult,
} from '../gateway-auth/gateway-bootstrap-delivery.js';
import {
  GatewayBootstrapHttpExchangeServer,
  type GatewayBootstrapHttpExchangeAddress,
} from '../gateway-auth/gateway-bootstrap-network.js';
import {
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
} from '../gateway-auth/gateway-bootstrap.js';
import {
  GatewayHttpNetworkTransport,
  type GatewayHttpNetworkAddress,
} from '../gateway-auth/http-network-transport.js';
import { GatewaySessionManager } from '../gateway-auth/session-manager.js';
import {
  VoiceCandidateNetworkBoundary,
  type VoiceCandidateIntakePort,
} from '../gateway-auth/voice-candidate-network.js';
import { GatewayVoiceDevicePlaneNetworkHandler } from '../gateway-auth/voice-device-plane-network.js';
import { RealtimeCommandSessionManager } from '../realtime-session/manager.js';
import {
  W14CurrentDeviceTargetBindingSource,
  type LocalCurrentVoiceTargetBindingSource,
} from './current-device-target-source.js';
import { W14LocalGovernedDeviceDispatchPort } from './governed-device-dispatch.js';
import { W03PostgresExecutionAttemptQuotaCas } from './w03-attempt-quota-cas.js';
import { W03PostgresExecutionAttemptQuotaSource } from './w03-attempt-quota-source.js';
import { W03PostgresCurrentContainmentStateSource } from './w03-containment-state.js';
import { W03PostgresContainmentStateStore } from './w03-containment-state-write.js';
import {
  W03PostgresExecutionIdempotencyFence,
  type LocalW07IdempotencyFencePort,
} from './w03-execution-fence.js';
import { W03PostgresHalfOpenProbeLease } from './w03-half-open-probe-lease.js';
import {
  W03PostgresPhysicalExecutionStateStager,
  type W15JPhysicalExecutionStateSeed,
  type W15JPhysicalExecutionStateStageResult,
} from './w03-physical-execution-state-stage.js';
import {
  PsqlW03SyncExecutor,
  W03PostgresDeviceReservationAdapter,
} from './w03-postgres-reservations.js';

const LOOPBACK_HOST = '127.0.0.1' as const;
const DEFAULT_GATEWAY_PORT = 8080;
const DEFAULT_BOOTSTRAP_PORT = 8081;
const MAX_DATE_MS = 8_640_000_000_000_000;

interface W15JLocalPhysicalHostDependencyBase {
  /** Concrete W07 Receipt/Evidence observer. W14 never decides outcome or retry. */
  readonly receiptEvidenceIngress: W07DeviceReceiptEvidenceIngressPort;
}

export interface W15JServerContainmentCircuitRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly event: 'SUCCESS' | 'FAILURE' | 'RECOVERY_WINDOW_ELAPSED' | 'HALF_OPEN_PROBE_STARTED';
  readonly failureThreshold: number;
  readonly recoveryAfterMs: number;
  readonly probeActionIntentId?: ActionIntent['actionIntentId'];
  readonly probeLeaseExpiresAt?: Rfc3339Timestamp;
}

export interface W15JServerContainmentKillSwitchRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly changedAt: Rfc3339Timestamp;
  readonly command: 'ACTIVATE' | 'DEACTIVATE';
  readonly recoveryGate: 'NOT_REQUIRED' | 'VALIDATED' | 'NOT_VALIDATED';
}

type W15JServerReconciliationReason =
  | 'RECONCILIATION_REQUIRED'
  | 'RECONCILIATION_SCHEMA_MISMATCH'
  | 'RECONCILIATION_ACTION_INTENT_MISMATCH'
  | 'RECONCILIATION_CORRELATION_MISMATCH'
  | 'RECONCILIATION_UNCERTAINTY_INVALID'
  | 'RECONCILIATION_TIME_INVALID'
  | 'RECONCILIATION_TIME_ORDER_INVALID'
  | 'EFFECT_ALREADY_OBSERVED'
  | 'RECONCILIATION_INDETERMINATE'
  | 'RETRY_ATTEMPT_LIMIT_REACHED'
  | 'RETRY_GUARDS_REQUIRED'
  | 'RETRY_GUARDS_TIME_INVALID'
  | 'RETRY_GUARDS_STALE'
  | 'RETRY_GUARDS_ATTEMPT_MISMATCH'
  | 'RETRY_GUARDS_BLOCKED';

export interface W15JServerReconciliationProof {
  readonly kind: 'EXECUTION_RECONCILIATION_RESULT';
  readonly schemaVersion: ContractVersion;
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly state:
    | 'STILL_UNCERTAIN'
    | 'EFFECT_OBSERVED'
    | 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED'
    | 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE';
  readonly reasons: readonly W15JServerReconciliationReason[];
  readonly reconciliationRequired: boolean;
  readonly retryEligibleAfterFreshGuards: boolean;
  readonly nextAttemptNumber?: number;
  readonly authorizesExecution: false;
}

interface W15JServerContainmentOperationalBase {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export type W15JServerContainmentOperationalRequest =
  | (W15JServerContainmentOperationalBase & Readonly<{ readonly command: 'REQUEST_CANCELLATION' }>)
  | (W15JServerContainmentOperationalBase &
      Readonly<{
        readonly command: 'CLEAR_CANCELLATION';
        readonly reconciliationGate: 'COMPLETED' | 'NOT_COMPLETED';
      }>)
  | (W15JServerContainmentOperationalBase &
      Readonly<{ readonly command: 'BEGIN_IN_FLIGHT' | 'END_IN_FLIGHT' }>)
  | (W15JServerContainmentOperationalBase &
      Readonly<{
        readonly command: 'UPDATE_DEPENDENCY_HEALTH';
        readonly observation: Readonly<{
          readonly kind: 'SERVER_DEPENDENCY_HEALTH_OBSERVATION';
          readonly tenantId: TenantId;
          readonly circuitKey: string;
          readonly observedAt: Rfc3339Timestamp;
          readonly health: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
          readonly authorizesExecution: false;
        }>;
      }>)
  | (W15JServerContainmentOperationalBase &
      Readonly<{
        readonly command: 'ADVANCE_RETRY_DEPTH';
        readonly actionIntentId: ActionIntent['actionIntentId'];
        readonly expectedRetryDepth: number;
        readonly retryEligibility: W15JServerReconciliationProof;
      }>)
  | (W15JServerContainmentOperationalBase &
      Readonly<{
        readonly command: 'RESET_RETRY_DEPTH';
        readonly actionIntentId: ActionIntent['actionIntentId'];
        readonly terminalReconciliation: W15JServerReconciliationProof;
      }>);

export type W15JServerContainmentLifecycleResult =
  | Readonly<{
      ok: true;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'STATE_UNAVAILABLE'
        | 'STATE_CONFLICT'
        | 'TRANSITION_REJECTED'
        | 'PROBE_FENCE_REJECTED'
        | 'PROOF_REJECTED';
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface LocalW07ContainmentLifecyclePort {
  transitionCircuit(
    input: W15JServerContainmentCircuitRequest,
  ): W15JServerContainmentLifecycleResult;
  transitionKillSwitch(
    input: W15JServerContainmentKillSwitchRequest,
  ): W15JServerContainmentLifecycleResult;
  transitionOperational(
    input: W15JServerContainmentOperationalRequest,
  ): W15JServerContainmentLifecycleResult;
}

export type W15JServerAttemptLifecycleResult =
  | Readonly<{
      status: 'ADVANCED' | 'SEALED';
      attemptNumber: number;
      maxAttempts: number;
      version: number;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      status: 'REJECTED';
      reason: string;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface LocalW07AttemptLifecyclePort {
  reconcileAndAdvance(input: object): W15JServerAttemptLifecycleResult;
  reconcileAndSealTerminal(input: object): W15JServerAttemptLifecycleResult;
}

export type W15JLocalPhysicalHostDependencies = W15JLocalPhysicalHostDependencyBase &
  (
    | Readonly<{
        /** Compatibility/evaluation-only intake. Canonical voice execution should use the factory. */
        voiceIntake: VoiceCandidateIntakePort;
        createVoiceIntake?: never;
      }>
    | Readonly<{
        /**
         * W07-owned immutable factory invoked only after current W14 managers/dispatch, W03-C
         * business idempotency, W14 DEVICE target source, durable W03 attempt/quota and durable
         * W03 containment sources exist. It resolves composition without mutable setters.
         */
        createVoiceIntake: (
          governedDeviceDispatch: W14LocalGovernedDeviceDispatchPort,
          idempotencyFence: LocalW07IdempotencyFencePort,
          targetBindings: LocalCurrentVoiceTargetBindingSource,
          attemptQuotaState: W03PostgresExecutionAttemptQuotaSource,
          containmentState: W03PostgresCurrentContainmentStateSource,
        ) => VoiceCandidateIntakePort;
        createContainmentLifecycle: (
          containmentState: W03PostgresCurrentContainmentStateSource,
          containmentStore: W03PostgresContainmentStateStore,
          halfOpenProbeFence: W03PostgresHalfOpenProbeLease,
        ) => LocalW07ContainmentLifecyclePort;
        createAttemptLifecycle: (
          attemptQuotaState: W03PostgresExecutionAttemptQuotaSource,
          attemptQuotaPersistence: W03PostgresExecutionAttemptQuotaCas,
        ) => LocalW07AttemptLifecyclePort;
        voiceIntake?: never;
      }>
  );

export interface W15JLocalPhysicalHostConfig {
  readonly databaseUrl: string;
  readonly psqlBinary?: string;
  readonly psqlTimeoutMs?: number;
  readonly gatewayPort?: number;
  readonly bootstrapPort?: number;
  readonly clock?: () => number;
}

export interface W15JLocalPhysicalHostAddress {
  readonly gateway: GatewayHttpNetworkAddress;
  readonly bootstrap: GatewayBootstrapHttpExchangeAddress;
  readonly hostMode: 'LOOPBACK_ONLY';
  readonly physicalEvidenceStatus: 'NOT_RUN';
  readonly authorizesExecution: false;
}

function validPort(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 65_535;
}

function currentTime(clock: () => number): number {
  const nowMs = clock();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > MAX_DATE_MS) {
    throw new Error('W15-J LOCAL host clock returned an invalid timestamp.');
  }
  return nowMs;
}

function resolveVoiceIntake(
  dependencies: W15JLocalPhysicalHostDependencies,
  dispatch: W14LocalGovernedDeviceDispatchPort,
  idempotencyFence: LocalW07IdempotencyFencePort,
  targetBindings: LocalCurrentVoiceTargetBindingSource,
  attemptQuotaState: W03PostgresExecutionAttemptQuotaSource,
  containmentState: W03PostgresCurrentContainmentStateSource,
): VoiceCandidateIntakePort {
  if ('createVoiceIntake' in dependencies && dependencies.createVoiceIntake !== undefined) {
    let intake: VoiceCandidateIntakePort;
    try {
      intake = dependencies.createVoiceIntake(
        dispatch,
        idempotencyFence,
        targetBindings,
        attemptQuotaState,
        containmentState,
      );
    } catch {
      throw new Error('W15-J W07 voice intake factory failed.');
    }
    if (intake === null || typeof intake !== 'object' || typeof intake.evaluate !== 'function') {
      throw new Error('W15-J W07 voice intake factory returned an invalid port.');
    }
    return intake;
  }
  return dependencies.voiceIntake;
}

function unavailableContainmentLifecycle(): W15JServerContainmentLifecycleResult {
  return {
    ok: false,
    code: 'STATE_UNAVAILABLE',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function unavailableAttemptLifecycle(): W15JServerAttemptLifecycleResult {
  return {
    status: 'REJECTED',
    reason: 'PERSISTENCE_UNAVAILABLE',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

/**
 * Controlled W15-J LOCAL physical host composition.
 *
 * W14 owns gateway/device/session/trust/transport state. W03 owns durable idempotency, current
 * attempt/quota and current containment state through the accepted Postgres schema. W07 ports are
 * injected as already-composed owner adapters. The host exposes structural current-owner ports only
 * after creating their owners; it never bypasses W07, promotes a receipt to VERIFIED, decides
 * retry, or synthesizes physical acceptance evidence.
 */
export class W15JLocalPhysicalHost {
  readonly governedDeviceDispatch: W14LocalGovernedDeviceDispatchPort;
  readonly #clock: () => number;
  readonly #gatewayPort: number;
  readonly #bootstrapPort: number;
  readonly #bootstrapDelivery: GatewayBootstrapDeliveryBroker;
  readonly #executionStateStager: W03PostgresPhysicalExecutionStateStager;
  readonly #attemptLifecycle: LocalW07AttemptLifecyclePort | null;
  readonly #containmentLifecycle: LocalW07ContainmentLifecyclePort | null;
  readonly #gatewayTransport: GatewayHttpNetworkTransport;
  readonly #bootstrapServer: GatewayBootstrapHttpExchangeServer;
  #started = false;

  constructor(
    config: W15JLocalPhysicalHostConfig,
    dependencies: W15JLocalPhysicalHostDependencies,
  ) {
    const gatewayPort = config.gatewayPort ?? DEFAULT_GATEWAY_PORT;
    const bootstrapPort = config.bootstrapPort ?? DEFAULT_BOOTSTRAP_PORT;
    if (!validPort(gatewayPort) || !validPort(bootstrapPort)) {
      throw new Error('W15-J LOCAL host port configuration is invalid.');
    }
    if (gatewayPort !== 0 && bootstrapPort !== 0 && gatewayPort === bootstrapPort) {
      throw new Error('W15-J LOCAL host requires distinct gateway and bootstrap ports.');
    }

    this.#clock = config.clock ?? Date.now;
    this.#gatewayPort = gatewayPort;
    this.#bootstrapPort = bootstrapPort;
    currentTime(this.#clock);

    const bootstrapIssuer = new TransientGatewayBootstrapBroker();
    this.#bootstrapDelivery = new GatewayBootstrapDeliveryBroker(bootstrapIssuer);
    const gatewaySessions = new GatewaySessionManager(bootstrapIssuer);

    const devices = new InMemoryDeviceRegistry();
    const deviceSessions = new DeviceSessionTrustManager();
    const realtimeCommands = new RealtimeCommandSessionManager(gatewaySessions, devices);
    const deviceProofVerifier = new DeviceKeyProofVerifier(devices);
    const currentDeviceTargets = new W14CurrentDeviceTargetBindingSource(devices);

    const sql = new PsqlW03SyncExecutor({
      databaseUrl: config.databaseUrl,
      ...(config.psqlBinary === undefined ? {} : { psqlBinary: config.psqlBinary }),
      ...(config.psqlTimeoutMs === undefined ? {} : { timeoutMs: config.psqlTimeoutMs }),
    });
    const durableReservations = new W03PostgresDeviceReservationAdapter(sql);
    const executionIdempotencyFence = new W03PostgresExecutionIdempotencyFence(sql);
    const executionAttemptQuota = new W03PostgresExecutionAttemptQuotaSource(sql);
    const executionAttemptQuotaCas = new W03PostgresExecutionAttemptQuotaCas(sql);
    const currentContainment = new W03PostgresCurrentContainmentStateSource(sql);
    const containmentStore = new W03PostgresContainmentStateStore(sql);
    const halfOpenProbeFence = new W03PostgresHalfOpenProbeLease(sql);
    this.#executionStateStager = new W03PostgresPhysicalExecutionStateStager(sql);
    const deliveries = new DeviceCommandDeliveryManager(durableReservations);
    const receiptIngress = new DeviceReceiptIngressManager({
      sessionTrust: deviceSessions,
      cancellation: realtimeCommands,
      authentication: deviceProofVerifier,
      durableIngress: durableReservations,
      w07Ingress: dependencies.receiptEvidenceIngress,
    });

    this.governedDeviceDispatch = new W14LocalGovernedDeviceDispatchPort({
      gatewaySessions,
      devices,
      deviceSessions,
      realtimeCommands,
      deliveries,
    });

    if ('createContainmentLifecycle' in dependencies) {
      try {
        const lifecycle = dependencies.createContainmentLifecycle(
          currentContainment,
          containmentStore,
          halfOpenProbeFence,
        );
        if (
          lifecycle === null ||
          typeof lifecycle !== 'object' ||
          typeof lifecycle.transitionCircuit !== 'function' ||
          typeof lifecycle.transitionKillSwitch !== 'function' ||
          typeof lifecycle.transitionOperational !== 'function'
        ) {
          throw new Error('invalid port');
        }
        this.#containmentLifecycle = lifecycle;

        const attemptLifecycle = dependencies.createAttemptLifecycle(
          executionAttemptQuota,
          executionAttemptQuotaCas,
        );
        if (
          attemptLifecycle === null ||
          typeof attemptLifecycle !== 'object' ||
          typeof attemptLifecycle.reconcileAndAdvance !== 'function' ||
          typeof attemptLifecycle.reconcileAndSealTerminal !== 'function'
        ) {
          throw new Error('invalid attempt lifecycle port');
        }
        this.#attemptLifecycle = attemptLifecycle;
      } catch {
        throw new Error('W15-J W07 durable lifecycle factory failed.');
      }
    } else {
      this.#containmentLifecycle = null;
      this.#attemptLifecycle = null;
    }

    const voiceIntake = resolveVoiceIntake(
      dependencies,
      this.governedDeviceDispatch,
      executionIdempotencyFence,
      currentDeviceTargets,
      executionAttemptQuota,
      currentContainment,
    );
    const voiceCandidates = new VoiceCandidateNetworkBoundary(voiceIntake);
    const devicePlane = new GatewayVoiceDevicePlaneNetworkHandler(
      {
        devices,
        deviceSessions,
        realtimeCommands,
        deliveries,
        receiptIngress,
        deviceProofVerifier,
      },
      { deviceSessions, voiceCandidates },
    );

    this.#gatewayTransport = new GatewayHttpNetworkTransport(
      gatewaySessions,
      { host: LOOPBACK_HOST, clock: this.#clock },
      devicePlane,
    );
    this.#bootstrapServer = new GatewayBootstrapHttpExchangeServer(this.#bootstrapDelivery, {
      host: LOOPBACK_HOST,
      clock: this.#clock,
    });
  }

  stageExecutionState(seed: W15JPhysicalExecutionStateSeed): W15JPhysicalExecutionStateStageResult {
    return this.#executionStateStager.stage(seed);
  }

  /** Server-side DP5 control surface; it is not mounted on the Android/gateway HTTP boundary. */
  transitionContainmentCircuit(
    input: W15JServerContainmentCircuitRequest,
  ): W15JServerContainmentLifecycleResult {
    if (this.#containmentLifecycle === null) return unavailableContainmentLifecycle();
    try {
      return this.#containmentLifecycle.transitionCircuit(input);
    } catch {
      return unavailableContainmentLifecycle();
    }
  }

  /** Server-side DP5 control surface; W07 still requires recovery evidence for deactivation. */
  transitionContainmentKillSwitch(
    input: W15JServerContainmentKillSwitchRequest,
  ): W15JServerContainmentLifecycleResult {
    if (this.#containmentLifecycle === null) return unavailableContainmentLifecycle();
    try {
      return this.#containmentLifecycle.transitionKillSwitch(input);
    } catch {
      return unavailableContainmentLifecycle();
    }
  }

  /** Server-only W07-F/C surface. A successful CAS still does not authorize a retry. */
  reconcileAndAdvanceExecutionAttempt(input: object): W15JServerAttemptLifecycleResult {
    if (this.#attemptLifecycle === null) return unavailableAttemptLifecycle();
    try {
      return this.#attemptLifecycle.reconcileAndAdvance(input);
    } catch {
      return unavailableAttemptLifecycle();
    }
  }

  /** Server-only terminal seal after W07-F reconciliation; never a verified-outcome claim. */
  reconcileAndSealExecutionAttempt(input: object): W15JServerAttemptLifecycleResult {
    if (this.#attemptLifecycle === null) return unavailableAttemptLifecycle();
    try {
      return this.#attemptLifecycle.reconcileAndSealTerminal(input);
    } catch {
      return unavailableAttemptLifecycle();
    }
  }

  /** Server-side DP5 control surface; operational facts remain W07-owned and non-authoritative. */
  transitionContainmentOperational(
    input: W15JServerContainmentOperationalRequest,
  ): W15JServerContainmentLifecycleResult {
    if (this.#containmentLifecycle === null) return unavailableContainmentLifecycle();
    try {
      return this.#containmentLifecycle.transitionOperational(input);
    } catch {
      return unavailableContainmentLifecycle();
    }
  }

  stageBootstrap(principal: AuthenticatedGatewayBootstrapPrincipal): GatewayBootstrapStageResult {
    return this.#bootstrapDelivery.stage(principal, currentTime(this.#clock));
  }

  async start(): Promise<W15JLocalPhysicalHostAddress> {
    if (this.#started) throw new Error('W15-J LOCAL physical host is already started.');
    const gateway = await this.#gatewayTransport.start(this.#gatewayPort);
    try {
      const bootstrap = await this.#bootstrapServer.start(this.#bootstrapPort);
      this.#started = true;
      return Object.freeze({
        gateway,
        bootstrap,
        hostMode: 'LOOPBACK_ONLY',
        physicalEvidenceStatus: 'NOT_RUN',
        authorizesExecution: false,
      });
    } catch (error) {
      await this.#gatewayTransport.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    let firstError: unknown;
    try {
      await this.#bootstrapServer.stop();
    } catch (error) {
      firstError = error;
    }
    try {
      await this.#gatewayTransport.stop();
    } catch (error) {
      if (firstError === undefined) firstError = error;
    }
    this.#started = false;
    if (firstError !== undefined) throw firstError;
  }
}
