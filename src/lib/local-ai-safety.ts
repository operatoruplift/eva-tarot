export const LOCAL_AI_STORAGE_ERROR = 'There is not enough browser storage to load this reader while keeping space for your journal. Free space or choose the Light reader, then try again.';
export const LOCAL_AI_GPU_ERROR = 'This device ran out of graphics memory or lost its GPU connection. Close other reader tabs or choose the Light reader, then reload.';
export const LOCAL_AI_OTHER_TAB_ERROR = 'The private reader is open in another tab. Close that tab before loading it here.';

// Leave room for cache metadata, runtime files, and future journal writes.
const JOURNAL_RESERVE_BYTES = 64 * 1024 * 1024;
export function localReaderRequiredBytes(downloadMB: number): number {
  return Math.ceil(downloadMB * 1024 * 1024 * 1.15) + JOURNAL_RESERVE_BYTES;
}

/** Called only for an explicit load. A denied persistence request is nonfatal. */
export async function prepareLocalReaderStorage(downloadMB: number, cached: boolean | null, storage?: Pick<StorageManager, 'estimate' | 'persist'>): Promise<void> {
  try { await storage?.persist?.(); } catch { /* Browsers may deny persistence. */ }
  if (cached === true || !storage?.estimate) return;
  let estimate: StorageEstimate;
  try { estimate = await storage.estimate(); } catch { return; }
  const { quota, usage } = estimate;
  if (typeof quota !== 'number' || typeof usage !== 'number' || !Number.isFinite(quota) || !Number.isFinite(usage) || quota < 0 || usage < 0) return;
  if (Math.max(0, quota - usage) < localReaderRequiredBytes(downloadMB)) throw new Error(LOCAL_AI_STORAGE_ERROR);
}

/** Runtime worker errors can arrive as strings. Never display their raw text. */
export function localReaderFailureMessage(error: unknown, fallback: string): string {
  const text = typeof error === 'string' ? error : error instanceof Error ? `${error.name}: ${error.message}` : '';
  if (text === `Error: ${LOCAL_AI_OTHER_TAB_ERROR}` || text === LOCAL_AI_OTHER_TAB_ERROR) return LOCAL_AI_OTHER_TAB_ERROR;
  if (/QuotaExceeded|quota.{0,30}(exceed|full)|storage.{0,30}(full|space)|not enough browser storage/i.test(text)) return LOCAL_AI_STORAGE_ERROR;
  if (/out of.{0,20}memory|\boom\b|device.{0,30}lost|lost.{0,30}(gpu|device)|gpu.{0,30}(memory|lost)|graphics memory/i.test(text)) return LOCAL_AI_GPU_ERROR;
  return fallback;
}

/** Hold one GPU reader per origin without queueing a load behind another tab. */
export async function acquireLocalReaderLease(signal: AbortSignal, locks?: Pick<LockManager, 'request'>): Promise<() => void> {
  if (signal.aborted) throw new DOMException('Local AI was stopped.', 'AbortError');
  if (!locks) return () => {};
  return new Promise<() => void>((resolve, reject) => {
    let settled = false;
    let finishHold: (() => void) | undefined;
    const release = () => {
      signal.removeEventListener('abort', onAbort);
      finishHold?.();
    };
    const onAbort = () => {
      release();
      if (!settled) { settled = true; reject(new DOMException('Local AI was stopped.', 'AbortError')); }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve().then(() => locks.request('evatarot-private-reader-gpu-v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (signal.aborted) return;
      if (!lock) {
        settled = true;
        release();
        reject(new Error(LOCAL_AI_OTHER_TAB_ERROR));
        return;
      }
      const held = new Promise<void>(resolveHold => { finishHold = resolveHold; });
      settled = true;
      resolve(release);
      await held;
    })).catch(() => {
      // Some browsing modes expose Web Locks but deny its use.
      release();
      if (!settled) { settled = true; resolve(() => {}); }
    });
  });
}
