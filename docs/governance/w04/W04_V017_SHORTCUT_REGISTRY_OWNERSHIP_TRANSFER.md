# W04 v0.17 User Shortcut Registry — Ownership Transfer

Date: 2026-09-13  
Status: `PREBUILD_ONLY / NON-AUTHORITATIVE / PROGRAM_CONTROL_ALLOCATION`

## Purpose

Program Control records a narrow prebuild ownership transfer for the Aurora-native user shortcut registry introduced for v0.17 exploration. This allocation exists to remove unplanned path overlap while preserving the canonical W04 ownership model and all execution/authority boundaries.

## Allocated implementation surfaces

The following paths are allocated together as one bounded W04 prebuild semantic leaf:

- `packages/control/src/shortcut-registry/**`
- `packages/control/test/w04-user-shortcut-registry.test.ts`

The implementing lane may modify only these runtime/test paths for shortcut-registry semantics. `packages/control/src/index.ts`, package manifests, lockfiles, root build/workspace configuration, CI, CODEOWNERS, contracts/schemas and other shared/publication surfaces remain Program Control-owned barriers unless separately reconciled.

## Semantic ownership

This prebuild leaf owns only deterministic user alias resolution to existing canonical W04 capability/capability-binding identifiers. It may:

- normalize bounded user aliases deterministically;
- resolve exact aliases to already-registered capabilities or bindings;
- project canonical capability availability;
- enforce tenant isolation and immutable non-authoritative results.

It may not:

- create or replace the canonical Capability Registry;
- add arbitrary URLs, package commands, shell commands or UI automation targets;
- discover/install/launch Android applications directly;
- issue `OwnerDecision`, `PolicyToken` or W07 authorization;
- perform device/provider side effects;
- infer execution success or authorize retry;
- widen W15 device ownership;
- unblock W15-J/DP5 or W16 BUILD.

## Dependency and publication boundary

This leaf consumes the accepted W04-B Capability Registry contract and remains `PREBUILD_ONLY` while W15-J/DP5 is incomplete. Any future Android installed-app discovery adapter remains W15-owned and may only populate governed capability bindings; this registry is an alias-resolution layer over those bindings.

Merging or publishing this leaf still requires fresh exact-head Quality, Test Build and Security evidence plus review-clean status. This ownership record does not itself grant merge, runtime publication, execution authority, physical acceptance or W16 readiness.

`INTELLIGENCE != AUTHORITY != EXECUTION` remains invariant.
