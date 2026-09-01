# W07-H Mock Consumer Fixture Matrix

Date: 2026-09-01
Status: `CANDIDATE`

| Future consumer | W07 target kind | H fixture rule | Runtime ownership retained by |
| --- | --- | --- | --- |
| W08 provider plane | `PROVIDER` | Resolve generic provider target and produce generic receipt only | W08 |
| W09 workflow plane | `WORKFLOW` | Opaque workflow binding reference; no workflow runtime import | W09 |
| W14 device foundation | `DEVICE` | Opaque device binding reference; no `DeviceId`/session/trust implementation | W14 |
| W15 Android/device runtime | `LOCAL_SERVICE` | Opaque local-service binding fixture; no Android/local runtime implementation | W15 |

All fixture chains consume W04 target-neutral CapabilityPlan and W07 generic target/receipt/evidence surfaces. No fixture grants authority; execution eligibility remains contingent on current W02 validation and W07 safeguards/containment.
