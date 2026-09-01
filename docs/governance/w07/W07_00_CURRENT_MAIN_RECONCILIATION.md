# W07-00 Current-Main Reconciliation

Date: 2026-09-01
Status: `W07_00_CURRENT_MAIN_RECONCILIATION_CANDIDATE`

## Purpose

This record reconciles the reviewed seven-file W07-00 coordination freeze from stale candidate PR #156 onto the current accepted program baseline without changing its frozen architecture semantics.

Historical embedded `Base main` / `Coordination base main` values inside the copied freeze documents remain provenance for the original live audit. They are not the base of this replacement candidate.

Replacement candidate base at creation: `37ead27f549b51b2b5322b0f45e72f5a95cc2584`.
Original stale candidate base: `b502bfa7e97291086c09cc85cd71040f96d3b036`.
Original stale candidate exact HEAD: `ee11c003ab13b8bdea5ea449634a0c18250cbc56`.

## Drift audit from original base to replacement base

Between `b502bfa7...` and `37ead27f...`, W05-00 coordination governance was accepted/merged and canonical program status/evidence was converged. No accepted W01/W02/W03/W04 contract/runtime source used by the W07-00 live debt audit was semantically replaced by W05-00. W05 remains intelligence-only and explicitly non-authoritative/non-executing.

The W07 provider-centric debt remains present and unchanged in the accepted contract family for W07-A to address:

- canonical ActionIntent remains provider-oriented through optional `providerBinding` and still lacks a first-class generic execution target;
- canonical Receipt still requires provider metadata and cannot honestly represent DEVICE/WORKFLOW/LOCAL_SERVICE without compatibility evolution;
- canonical Evidence remains partly generic but retains provider-specific receipt/readback vocabulary;
- matching schemas retain the same compatibility debt;
- W03 remains the canonical durability/idempotency source;
- W04 remains capability/control/budget source;
- W05 adds no executor authority or target runtime.

Therefore the original W07-00 charter, DAG, ownership, risk, acceptance and target-compatibility semantics remain applicable on the replacement base.

## Replacement publication rule

The replacement candidate consists of the original seven reviewed W07-00 governance blobs plus this reconciliation record, all parented directly on current accepted main. No runtime code, contract/schema implementation, provider adapter, workflow/device runtime or external side effect is introduced.

The replacement must obtain fresh exact-head Quality/Test Build/Security and applicable governance validation, independent Program Control review, controlled merge, post-merge exact-main verification and Drive/GitHub convergence. Only then may W07-A become BUILD-eligible.

## Supersession

PR #156 is stale-base provenance only and must not merge. Its green exact-head CI remains historical candidate evidence but cannot satisfy the replacement exact-head gate.

Decision target for the replacement: `ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED`.
