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
import {
  W03PostgresExecutionIdempotencyFence,
  type LocalW07IdempotencyFencePort,
} from './w03-execution-fence.js';
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
         * business idempotency and current W14 DEVICE target-source ports exist. It resolves
         * composition without mutable setters.
         */
        createVoiceIntake: (
          governedDeviceDispatch: W14LocalGovernedDeviceDispatchPort,
          idempotencyFence: LocalW07IdempotencyFencePort,
          targetBindings: LocalCurrentVoiceTargetBindingSource,
        ) => VoiceCandidateIntakePort;
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
): VoiceCandidateIntakePort {
  if ('createVoiceIntake' in dependencies && dependencies.createVoiceIntake !== undefined) {
    let intake: VoiceCandidateIntakePort;
    try {
      intake = dependencies.createVoiceIntake(dispatch, idempotencyFence, targetBindings);
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

/**
 * Controlled W15-J LOCAL physical host composition.
 *
 * W14 owns gateway/device/session/trust/transport state. W03 owns durable idempotency through the
 * accepted Postgres schema. W07 ports are injected as already-composed owner adapters. The host
 * exposes W14 transport dispatch, W03 business-idempotency and current W14 DEVICE target-source
 * structural ports for W07 only after creating their current owners; it never bypasses W07,
 * promotes a receipt to VERIFIED, decides retry, or synthesizes physical acceptance evidence.
 */
export class W15JLocalPhysicalHost {
  readonly governedDeviceDispatch: W14LocalGovernedDeviceDispatchPort;
  readonly #clock: () => number;
  readonly #gatewayPort: number;
  readonly #bootstrapPort: number;
  readonly #bootstrapDelivery: GatewayBootstrapDeliveryBroker;
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

    const voiceIntake = resolveVoiceIntake(
      dependencies,
      this.governedDeviceDispatch,
      executionIdempotencyFence,
      currentDeviceTargets,
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
