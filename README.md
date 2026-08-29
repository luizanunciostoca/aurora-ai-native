# AURORA AI-NATIVE — Development Baseline v0.3

This package reorganizes the existing Aurora/Manus/n8n assets according to the target architecture defined in the Aurora AI-Native Developer Manual v0.2.

## Important

- This is a **development baseline/scaffold**, not a claim that the target runtime is implemented.
- Existing code is preserved under mapped `legacy-reference` or `reference` areas.
- New target directories are created in their canonical future locations and include status markers.
- TOCA AI-NATIVE remains the canonical control architecture. Aurora is the voice-first command center/client. Manus is a bounded worker execution kernel reference. n8n is a governed automation/integration fabric.
- Android uses Presence Mode by default; Dashboard/Workspace is demand-driven.

## Top-level structure

```
aurora-ai-native/
├── apps/
├── services/
├── packages/
├── catalog/
├── infra/
├── evals/
├── docs/
├── tools/
└── reference/
```

See `docs/migration/FILE_MAPPING.csv` and `docs/migration/STRUCTURE_STATUS.csv` for mapping/status.
