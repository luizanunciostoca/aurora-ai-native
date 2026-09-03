# W11 Dependency Matrix

## Upstream gate for W11-00

- W08-G #259 — accepted; provider foundation available.
- W10-G #263 — accepted; revenue/CRM integration handoff available.

Both were revalidated before BUILD claim from `main` `b00f4818c5750330f5b2f65e9caa2caa632a628e`.

## Internal DAG

| Lane | Dependencies | Release condition |
| --- | --- | --- |
| W11-A #289 | W11-00 | W11-00 accepted |
| W11-C #290 | W11-00 | W11-00 accepted |
| W11-D #291 | W11-00 | W11-00 accepted |
| W11-G #300 | W11-00 | W11-00 accepted |
| W11-B #315 | W11-A | W11-A accepted |
| W11-E #316 | W11-C, W11-D | both accepted |
| W11-F #317 | W11-C, W10-G | both accepted |
| W11-H #325 | W11-B, W11-E, W11-F, W11-G | all accepted |

## Promotion rule

`puzzle-ready` or readiness artifacts are not dependency satisfaction. Promotion requires each dependency to be live `aurora:accepted`, an exact current-main reconciliation, no conflicting owner/canonical PR, and an isolated branch from a recorded base SHA.
