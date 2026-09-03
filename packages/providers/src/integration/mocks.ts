import type { ProviderReadTransportResult } from '../read/index.js';
import type {
  SafeProviderMockHarness,
  SafeProviderMockScript,
  SafeProviderMockTrace,
} from './types.js';

function snapshot(trace: SafeProviderMockTrace): SafeProviderMockTrace {
  return { ...trace };
}

/**
 * Deterministic, in-memory provider double. It exposes no network client and
 * stores no credential in trace/evidence; transient material only crosses the
 * existing W08-B callback boundary.
 */
export function createSafeProviderMock(script: SafeProviderMockScript): SafeProviderMockHarness {
  let credentialUses = 0;
  let writeCalls = 0;
  let readCalls = 0;
  let readbackCalls = 0;
  let readIndex = 0;

  return {
    credentials: {
      async withCredential(_lookup, consume) {
        credentialUses += 1;
        await consume(script.transientCredential);
      },
    },
    writeAdapter: {
      async writeOnce() {
        writeCalls += 1;
        return script.writeResult;
      },
    },
    readAdapter: {
      async readPage(): Promise<ProviderReadTransportResult> {
        readCalls += 1;
        const result = script.readResults?.[readIndex];
        readIndex += 1;
        return result ?? { ok: false, error: 'PERMANENT_REQUEST_REJECTED' };
      },
    },
    readbackAdapter: {
      async readbackOnce() {
        readbackCalls += 1;
        return (
          script.readbackResult ?? {
            ok: false,
            error: 'TRANSIENT_TRANSPORT_FAILURE',
          }
        );
      },
    },
    snapshot() {
      return snapshot({ credentialUses, writeCalls, readCalls, readbackCalls });
    },
  };
}
