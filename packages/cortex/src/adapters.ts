import { parseCortexSnapshot } from './contracts.js';
import type { CortexSearchDocument, CortexSnapshot } from './contracts.js';
import { searchCortexDocuments } from './model.js';

export interface CortexDataAdapter {
  readonly mode: 'MOCK_READ_ONLY' | 'RUNTIME_BLOCKED';
  loadSnapshot(signal?: AbortSignal): Promise<CortexSnapshot>;
  search(query: string, signal?: AbortSignal): Promise<readonly CortexSearchDocument[]>;
  subscribe(listener: (snapshot: CortexSnapshot) => void): () => void;
}

export class CortexRuntimeBlockedError extends Error {
  constructor() {
    super('CORTEX_RUNTIME_ADAPTER_BLOCKED_BY_W15J_DP5');
    this.name = 'CortexRuntimeBlockedError';
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new DOMException('Operation aborted', 'AbortError');
}

export class MockCortexDataAdapter implements CortexDataAdapter {
  readonly mode = 'MOCK_READ_ONLY' as const;
  readonly #snapshot: CortexSnapshot;

  constructor(snapshot: CortexSnapshot) {
    this.#snapshot = parseCortexSnapshot(snapshot);
  }

  async loadSnapshot(signal?: AbortSignal): Promise<CortexSnapshot> {
    assertNotAborted(signal);
    return this.#snapshot;
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly CortexSearchDocument[]> {
    assertNotAborted(signal);
    return searchCortexDocuments(this.#snapshot.searchDocuments, query).map(
      (result) => result.document,
    );
  }

  subscribe(listener: (snapshot: CortexSnapshot) => void): () => void {
    listener(this.#snapshot);
    return () => undefined;
  }
}

export class BlockedRuntimeCortexAdapter implements CortexDataAdapter {
  readonly mode = 'RUNTIME_BLOCKED' as const;

  async loadSnapshot(signal?: AbortSignal): Promise<CortexSnapshot> {
    void signal;
    throw new CortexRuntimeBlockedError();
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly CortexSearchDocument[]> {
    void query;
    void signal;
    throw new CortexRuntimeBlockedError();
  }

  subscribe(listener: (snapshot: CortexSnapshot) => void): () => void {
    void listener;
    return () => undefined;
  }
}
