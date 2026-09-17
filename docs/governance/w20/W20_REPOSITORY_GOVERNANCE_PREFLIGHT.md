# W20 Repository Governance Preflight — Release 1.0 Readiness

Status: `PREBUILD_READINESS_ONLY / RELEASE_HARDENING_REQUIRED`
Observed against live `main`: `77f0f8532197025ee913dd02fcb56878d9d667a9`
Observed: 2026-09-17
Owner wave: W20 release readiness; repository-setting change remains an explicit administrative action, not an automatic PREBUILD side effect.

## Finding RG-001 — canonical main has no enforced branch protection/ruleset

Live GitHub evidence at reconciliation time:

- branch `main` reports `protected=false`;
- repository rulesets endpoint returns an empty set;
- `CODEOWNERS` exists and identifies canonical ownership, but CODEOWNERS without an enforcing branch rule does not itself require review or status checks;
- canonical workflows Quality, Test Build and Security run on pull requests and on pushes to `main`, but no live repository rule currently requires those checks before a direct main update.

### Risk

The project process already relies on exact-head Quality/Test Build/Security, expected-head reconciliation and controlled merge discipline. Without an enforcing GitHub branch rule/ruleset, that discipline is procedural rather than repository-enforced. A direct push, force push or merge that does not satisfy the intended gates can therefore become canonical `main` unless prevented by operator discipline or another external control.

This is not evidence that such an unsafe push has occurred. It is a release-governance gap that should be closed before Release 1.0.

### Recommended release hardening

Before W20-J final release decision, configure a `main` branch rule or repository ruleset that, subject to GitHub-plan/permission support:

1. requires changes to reach `main` through pull requests or an equivalently governed merge path;
2. requires canonical status checks for the exact merge candidate, including at minimum Quality, Test Build and Security, plus the final Reality Gate when it becomes canonical;
3. prevents force pushes and branch deletion;
4. requires review-conversation resolution where review is used;
5. preserves expected-head/race revalidation rather than allowing stale green checks to authorize a moved candidate;
6. keeps CODEOWNERS aligned with actual ownership boundaries;
7. defines tightly bounded emergency/break-glass bypass ownership with auditable use rather than broad routine bypass;
8. does not require a history mode that conflicts with the project's accepted controlled-merge evidence model unless governance explicitly changes that model.

### Verification evidence required

At W20 release time capture:

- exact ruleset/branch-protection configuration and effective target;
- required check names and their mapping to current workflows;
- force-push/deletion policy;
- bypass actors/conditions;
- test proving an unqualified candidate cannot update `main`;
- test proving the normal governed merge path still works;
- reference from the ReleaseAcceptanceIndex/ReleaseRollbackManifest where appropriate.

### Release disposition

`RG-001 = OPEN_PREBUILD_HARDENING_GAP`

Do not mark Release 1.0 `READY_FOR_RELEASE` while canonical-main integrity depends only on informal operator discipline unless W20 governance explicitly accepts and evidences an equivalent enforcement mechanism.
