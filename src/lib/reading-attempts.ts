type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type ReadingAttempt = { id: string; storageKey?: string };
type SavedAttempt = { id: string; createdAt: number };

const PREFIX = 'eva-reading-attempt:';
const MAX_AGE = 24 * 60 * 60 * 1_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function browserStorage(): AttemptStorage | undefined {
  try { return typeof sessionStorage === 'undefined' ? undefined : sessionStorage; }
  catch { return undefined; }
}

/** Stores only a random reference and time under a digest, never the chat text. */
export function createReadingAttemptStore(storage: () => AttemptStorage | undefined = browserStorage) {
  const memory = new Map<string, SavedAttempt>();
  const valid = (value: unknown): value is SavedAttempt => {
    if (!value || typeof value !== 'object') return false;
    const saved = value as Partial<SavedAttempt>;
    return typeof saved.id === 'string' && UUID.test(saved.id) && typeof saved.createdAt === 'number'
      && Number.isFinite(saved.createdAt) && saved.createdAt <= Date.now() + 60_000 && Date.now() - saved.createdAt < MAX_AGE;
  };
  return {
    async acquire(requestKey: string | undefined, body: string): Promise<ReadingAttempt> {
      if (!requestKey || !crypto.subtle) return { id: crypto.randomUUID() };
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([requestKey, body])));
      const storageKey = PREFIX + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      let saved: unknown = memory.get(storageKey);
      let target: AttemptStorage | undefined;
      try {
        target = storage();
        if (!valid(saved)) saved = JSON.parse(target?.getItem(storageKey) ?? 'null');
      } catch { /* A free reading still works when browser storage is blocked. */ }
      if (!valid(saved)) {
        saved = { id: crypto.randomUUID(), createdAt: Date.now() };
        try { target?.setItem(storageKey, JSON.stringify(saved)); } catch { /* Keep retries stable in this tab. */ }
      }
      memory.set(storageKey, saved as SavedAttempt);
      if (memory.size > 100) memory.delete(memory.keys().next().value!);
      return { id: (saved as SavedAttempt).id, storageKey };
    },
    clear(attempt: ReadingAttempt) {
      if (!attempt.storageKey) return;
      if (memory.get(attempt.storageKey)?.id === attempt.id) memory.delete(attempt.storageKey);
      try {
        const target = storage();
        const saved: unknown = JSON.parse(target?.getItem(attempt.storageKey) ?? 'null');
        if (valid(saved) && saved.id === attempt.id) target?.removeItem(attempt.storageKey);
      } catch { /* Cleanup must not turn a completed reply into a failure. */ }
    },
  };
}

export const readingAttempts = createReadingAttemptStore();
