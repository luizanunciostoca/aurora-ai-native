import { DeviceCommandDeliveryManager } from '../device-command-delivery/manager.js';
import { InMemoryDeviceRegistry } from '../device/registry.js';
import { DeviceReceiptIngressManager } from '../device-receipt-ingress/manager.js';
import type { W07DeviceReceiptEvidenceIngressPort } from '../device-receipt-ingress/types.js';
import { DeviceSessionTrustManager } from '../device-session/session-trust.js';
import { DeviceKeyProofVerifier } from '../gateway-auth/device-key-proof-verifier.js';
import { GatewayBootstrapDeliveryBroker } from '../gateway-auth/gateway-bootstrap-delivery.js';
import {
  GatewayBootstrapHttpExchangeServer,
  type GatewayBootstrapHttpExchangeAddress,
} from '../gateway-auth/gateway-bootstrap-network.js';
import {
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
  type GatewayBootstrapStageResult,
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
  PsqlW03SyncExecutor,
  W03PostgresDeviceReservationAdapter,
} from './w03-postgres-reservations.js';

const LOOPBACK_HOST = '127.0.0.1' as const;
const DEFAULT_GATEWAY_PORT = 8080;
const DEFAULT_BOOTSTRAP_PORT = 8081;
const MAX_DATE_MS = 8_640_000_000_000_000;

export interface W15JLocalPhysicalHostDependencies {
  /** Concrete W07 voice intake; identity/policy/current-authority material stays outside W14. */
  readonly voiceIntake: VoiceCandidateIntakePort;
  /** Concrete W07 Receipt/Evidence observer. W14 never decides outcome or retry. */
  readonly receiptEvidenceIngress: W07DeviceReceiptEvidenceIngressPort;
}

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

/**
 * Controlled W15-J LOCAL physical host composition.
 *
 * W14 owns gateway/device/session/trust/transport state. W03 owns durable idempotency through the
 * accepted Postgres schema. W07 ports are injected as already-composed owner adapters. This class
 * never issues business authority, prepares a device command, promotes a receipt to VERIFIED, or
 * synthesizes physical acceptance evidence.
 */
export class W15JLocalPhysicalHost {
  readonly #clock: () => number;
  readonly #gatewayPort: number;
  readonly #bootstrapPort: number;
  readonly #bootstrapDelivery: GatewayBootstrapDeliveryBroker;
  readonly #gatewayTransport: GatewayHttpNetworkTransport;
  readonly #bootstrapServer: GatewayBootstrapHttpExchangeServer;
  #started = false;

  constructor(config: W15JLocalPhysicalHostConfig, dependencies: W15JLocalPhysicalHostDependencies) {
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

    const sql = new PsqlW03SyncExecutor({
      databaseUrl: config.databaseUrl,
      ...(config.psqlBinary === undefined ? {} : { psqlBinary: config.psqlBinary }),
      ...(config.psqlTimeoutMs === undefined ? {} : { timeoutMs: config.psqlTimeoutMs }),
    });
    const durableReservations = new W03PostgresDeviceReservationAdapter(sql);
    const deliveries = new DeviceCommandDeliveryManager(durableReservations);
    const receiptIngress = new DeviceReceiptIngressManager({
      sessionTrust: deviceSessions,
      cancellation: realtimeCommands,
      authentication: deviceProofVerifier,
      durableIngress: durableReservations,
      w07Ingress: dependencies.receiptEvidenceIngress,
    });

    const voiceCandidates = new VoiceCandidateNetworkBoundary(dependencies.voiceIntake);
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
