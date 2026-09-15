# W15-J LOCAL host operator boundary

This command prepares the software host for a physical window. It does not run a tablet scenario,
create acceptance evidence or change DP5 from `NOT_RUN`.

## Trusted provider contract

The LOCAL host does not accept database credentials, tenant, actor, policy, outcome or retry state
on argv or from Android. An operator-controlled external JavaScript module must retrieve those
values from their existing trusted server-side owners and export exactly one named factory:

```js
export async function createW15JLocalPhysicalHostOperatorInput() {
  const composition = await loadFromTrustedServerRuntime();
  return {
    databaseUrl: composition.databaseUrl,
    dependencies: {
      receiptEvidenceIngress: composition.receiptEvidenceIngress,
      createVoiceIntake: composition.createVoiceIntake,
      createContainmentLifecycle: composition.createContainmentLifecycle,
      createAttemptLifecycle: composition.createAttemptLifecycle,
    },
    principal: composition.alreadyAuthenticatedW14Principal,
  };
}
```

The provider file contains integration code, not embedded secrets. Its factory may read a managed
secret/runtime channel, but it must return an already-authenticated server-side W14 principal and
the existing W07/W14 owner adapters. The operator boundary rejects the evaluation-only
`voiceIntake` compatibility mode. The principal flags must remain `authorizesExecution: false` and
`canGrantPermission: false`; this bootstrap identity is never business authority. The exact-key
contract rejects provider-controlled runtime identity/version and all extra policy material.

## Reproducible command

Use the repository-pinned Node 22/npm 10 toolchain and the exact accepted dependency build:

```sh
npm ci
npm run build --workspace @aurora/contracts
npm run build --workspace @aurora/events
export AURORA_W15J_PROVIDER_MODULE=/absolute/path/to/trusted-w15j-provider.mjs
export AURORA_W15J_HOST_READINESS_DIR=/absolute/path/to/new-host-readiness-directory
node tools/physical/run-w15j-local-host.mjs
```

The launcher accepts no arguments and requires Node `>=22.16.0 <23`. A runtime-version mismatch
fails closed before any provider or build is loaded. `AURORA_W15J_PROVIDER_MODULE` is a non-secret
absolute file reference; a relative path, missing file, extra argv field, malformed export or
malformed provider result fails closed before a usable bootstrap is announced.

`AURORA_W15J_HOST_READINESS_DIR` must name a new absolute directory beneath a real, non-symlink
parent owned by the current uid and not writable by group or other. The launcher creates it with
owner-only permissions, binds cleanup to its device/inode and creates each file exclusively with
`O_NOFOLLOW` and mode `0600`. It removes a partial directory only while that exact inode remains at
the configured path; a swapped path is never recursively removed.

Every start deletes and silently recompiles `@aurora/contracts`, `@aurora/events` and the
mobile-gateway runtime from the checked-out sources. It therefore neither trusts a pre-existing
`dist` tree nor relies on Node executing TypeScript source directly. Build diagnostics stay off
stdout; a failed build produces only a bounded failure code on stderr.

Before and after the builds, before readiness files and immediately before the READY line, the
launcher uses the fixed, root-owned, non-writable `/usr/bin/git` to require a clean tracked
worktree/index and the same exact HEAD. It never resolves Git through `PATH`. After the runner is
ready it probes both loopback listeners with bounded non-mutating HTTP requests and writes only
normalized safe metadata plus zero exit-code files into the readiness directory. The gateway
identity is fixed as `aurora-w15j-local-host`; its version is derived as `git:<exact-head>`, never
from provider input. One canonical UTC timestamp and the positive host PID are captured after host
start and before the probes: each probe records them as `observed_at_utc` and `process_id`, while
`host-ready-announcement.txt` records the same values as `started_at_utc` and `process_id`. The
host creates a new non-secret `whi_<64 lowercase hex>` instance nonce for every start. The same
nonce is returned by `GET /v1/local-host/instance` on both existing listeners, with distinct
`DEVICE_GATEWAY` and `BOOTSTRAP_EXCHANGE` roles, and is recorded as `host_instance_id` in the ready
readiness file and both listener captures. The launcher also requires the normalized exact response
headers `cache-control: no-store` and `pragma: no-cache`; the listener captures record them as
`cache_control=no-store` and `pragma=no-cache`. Any body or header drift rejects startup and removes
partial readiness output. The instance ID is deliberately absent from the stdout bootstrap
announcement. A collector must query this route on both ports again at finalization and require the
same nonce and exact cache headers; a prior 405 response alone is not listener-ownership evidence. The contract remains
exactly nine files. The bootstrap probe uses `GET`; it never submits or consumes the one-shot
`gbr_*`. No bootstrap reference, provider text, principal, database URL, authentication material,
policy, outcome or retry decision is written to readiness storage.

The instance route returns HTTP 200 with this exact no-store JSON shape:

```json
{
  "kind": "LOCAL_HOST_INSTANCE",
  "hostInstanceId": "whi_<64 lowercase hex>",
  "listenerRole": "DEVICE_GATEWAY",
  "authorizesExecution": false,
  "provesExecutionSuccess": false,
  "retryAuthorized": false,
  "physicalEvidenceStatus": "NOT_RUN"
}
```

Port 8081 uses the same exact keys and values except `listenerRole` is `BOOTSTRAP_EXCHANGE`.

Its nonce proves only that both responses came from the same live host instance. It is not an
authentication credential, authority decision, execution outcome, physical PASS or retry grant.

On success stdout contains one JSON line with the existing allowlisted
`W15J_LOCAL_PHYSICAL_HOST_READY` announcement. It identifies only the opaque one-shot `gbr_*`
reference, expiry, loopback endpoints and bounded non-authority flags. It does not contain the
principal, gateway credential, authentication reference, policy material or verified outcome.

The fixed listeners are:

- authenticated W14 gateway/device/voice plane: `127.0.0.1:8080`;
- one-shot bootstrap exchange: `127.0.0.1:8081`.

`SIGINT` and `SIGTERM` use the existing idempotent runner shutdown. After startup, continue with the
physical operator checklist and record only real observations. Startup keeps
`physicalEvidenceStatus: NOT_RUN` and never authorizes execution, proves execution success or
authorizes retry.
