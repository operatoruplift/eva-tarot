import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { normalizeDay, readStorage, validDayNotes, validPersonalData, validPracticeDays, validProfile, validSessions } from './storage.ts';
import type { PersonalData, Profile, Session } from './storage.ts';

const DATABASE = 'evara-personal-data';
const STORE = 'snapshots';
const FALLBACK_KEY = 'evara-data-v2';
const FALLBACK_BASELINE_KEY = 'evara-data-v2-baseline';
const CHANGE_KEY = 'evara-data-changed';
const EMPTY: PersonalData = { profile: { name: '', onboarded: false }, sessions: [], practiceDays: [], dayNotes: {} };
type Snapshot = { version: 2; revision: number; data: PersonalData };
type Driver = { read: () => Promise<PersonalData | null>; write: (baseline: PersonalData, data: PersonalData) => Promise<PersonalData>; close: () => void };
type SaveWaiter = { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export type PersistenceStatus = 'loading' | 'saving' | 'saved' | 'error';
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const normalize = (data: PersonalData): PersonalData => ({ ...data, practiceDays: [...new Set(data.practiceDays.map(day => normalizeDay(day)!))] });

export function readLegacyData(): PersonalData {
  const combined = readStorage<PersonalData | null>(FALLBACK_KEY, null, validPersonalData);
  if (combined) return normalize(combined);
  return {
    profile: readStorage('evara-profile', EMPTY.profile, validProfile),
    sessions: readStorage('evara-sessions', [], validSessions),
    practiceDays: readStorage<string[]>('evara-practice-days', [], validPracticeDays).map(day => normalizeDay(day)!),
    dayNotes: readStorage('evara-day-notes', {}, validDayNotes),
  };
}

/** Apply only locally changed fields over the last committed version. New records
 * from another tab are always retained, including messages in a shared chat. */
export function mergePersonalData(baseline: PersonalData, local: PersonalData, remote: PersonalData): PersonalData {
  const profile = { ...remote.profile };
  for (const key of ['name', 'onboarded', 'avatar'] as const) {
    if (!equal(local.profile[key], baseline.profile[key])) Object.assign(profile, { [key]: local.profile[key] });
  }
  const previous = new Map(baseline.sessions.map(session => [session.id, session]));
  const sessions = new Map(remote.sessions.map(session => [session.id, session]));
  for (const session of local.sessions) {
    const original = previous.get(session.id);
    const other = sessions.get(session.id);
    if (!other || !original) {
      sessions.set(session.id, other ? mergeSession(undefined, session, other) : session);
    } else if (!equal(original, session)) sessions.set(session.id, mergeSession(original, session, other));
  }
  const dayNotes = { ...remote.dayNotes };
  for (const day of new Set([...Object.keys(baseline.dayNotes), ...Object.keys(local.dayNotes)])) {
    if (local.dayNotes[day] !== baseline.dayNotes[day]) {
      if (local.dayNotes[day] === undefined) delete dayNotes[day];
      else dayNotes[day] = local.dayNotes[day];
    }
  }
  return {
    profile, sessions: [...sessions.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    practiceDays: [...new Set([...remote.practiceDays, ...local.practiceDays].map(day => normalizeDay(day)!))], dayNotes,
  };
}
function mergeSession(original: Session | undefined, local: Session, remote: Session): Session {
  const merged = { ...remote };
  for (const key of ['title', 'focus', 'date', 'saved', 'note', 'daily', 'drawCount', 'revisedFrom'] as const) {
    if (!original || !equal(original[key], local[key])) Object.assign(merged, { [key]: local[key] });
  }
  const originals = new Map(original?.messages.map(message => [message.id, message]) ?? []);
  const messages = new Map(remote.messages.map(message => [message.id, message]));
  for (const message of local.messages) {
    if (!messages.has(message.id) || !equal(originals.get(message.id), message)) messages.set(message.id, message);
  }
  merged.messages = [...messages.values()];
  return merged;
}

async function openDriver(): Promise<Driver> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.');
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let failed = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => { failed = true; reject(request.error); };
    request.onblocked = () => { failed = true; reject(new Error('Another tab is updating storage. Close older Eva Tarot tabs and retry.')); };
    request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
  });
  database.onversionchange = () => database.close();
  return {
    read: () => new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get('main');
      let value: PersonalData | null = null;
      request.onsuccess = () => {
        if (request.result !== undefined && !validPersonalData(request.result?.data)) { transaction.abort(); return; }
        value = request.result ? normalize(request.result.data) : null;
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Saved data could not be read.'));
    }),
    write: (baseline, data) => new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get('main');
      let merged = data;
      request.onsuccess = () => {
        const current = request.result as Snapshot | undefined;
        if (current && !validPersonalData(current.data)) { transaction.abort(); return; }
        merged = current ? mergePersonalData(baseline, data, current.data) : data;
        store.put({ version: 2, revision: (current?.revision ?? 0) + 1, data: merged } satisfies Snapshot, 'main');
      };
      transaction.oncomplete = () => resolve(merged);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('The browser could not save your data.'));
    }),
    close: () => database.close(),
  };
}
function fallbackDriver(): Driver {
  const read = async (): Promise<PersonalData | null> => {
    const stored = localStorage.getItem(FALLBACK_KEY);
    if (stored === null) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!validPersonalData(parsed)) throw new Error('Saved data could not be read.');
    return normalize(parsed);
  };
  return {
    read,
    write: async (baseline, data) => {
      const current = await read();
      const merged = current ? mergePersonalData(baseline, data, current) : data;
      // Keep the baseline from when the outage began, not the latest fallback
      // snapshot, so recovery can distinguish offline edits from stale fields.
      if (!current) localStorage.setItem(FALLBACK_BASELINE_KEY, JSON.stringify(baseline));
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(merged));
      return merged;
    },
    close: () => {},
  };
}

export function reconcileFallbackData(stored: PersonalData, fallback: PersonalData, beforeOutage: PersonalData | null): PersonalData {
  return mergePersonalData(beforeOutage ?? EMPTY, fallback, stored);
}

async function promoteFallback(connection: Driver, stored: PersonalData | null): Promise<PersonalData | null> {
  const fallback = readStorage<PersonalData | null>(FALLBACK_KEY, null, validPersonalData);
  if (!fallback) return stored;
  const beforeOutage = readStorage<PersonalData | null>(FALLBACK_BASELINE_KEY, null, validPersonalData);
  const merged = stored ? reconcileFallbackData(stored, fallback, beforeOutage) : fallback;
  // A successful read is insufficient: first commit all fallback edits. An
  // aborted transaction must leave the recovery copy available on next launch.
  const committed = await connection.write(stored ?? EMPTY, merged);
  try {
    const current = readStorage<PersonalData | null>(FALLBACK_KEY, null, validPersonalData);
    if (equal(current, fallback)) localStorage.removeItem(FALLBACK_KEY);
  } catch { /* A duplicate recovery copy is safe; it will merge on next launch. */ }
  return committed;
}

export function createDataExport(data: PersonalData, language?: string): string {
  return JSON.stringify({ format: 'evara-personal-data', version: 2, exportedAt: new Date().toISOString(), ...data, ...(language ? { language } : {}) }, null, 2);
}
export function parseDataImport(text: string): PersonalData & { language?: string } {
  if (new TextEncoder().encode(text).byteLength > 50 * 1024 * 1024) throw new Error('Choose an Eva Tarot backup smaller than 50 MB.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('This file is not a readable Eva Tarot backup.'); }
  if (!raw || typeof raw !== 'object') throw new Error('This file is not an Eva Tarot backup.');
  const value = raw as Record<string, unknown>;
  if (value.format !== undefined && (value.format !== 'evara-personal-data' || value.version !== 2)) throw new Error('This backup version is not supported.');
  const data = { profile: value.profile, sessions: value.sessions, practiceDays: value.practiceDays ?? [], dayNotes: value.dayNotes ?? {} };
  if (!validPersonalData(data)) throw new Error('This backup contains invalid profile, conversation, or calendar data. Nothing was imported.');
  if (value.language !== undefined && (typeof value.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(value.language))) throw new Error('The backup language is invalid.');
  return { ...normalize(data), ...(typeof value.language === 'string' ? { language: value.language } : {}) };
}

export function usePersistentData() {
  const [data, setData] = useState<PersonalData>(readLegacyData);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<PersistenceStatus>('loading');
  const [error, setError] = useState('');
  const [limitedStorage, setLimitedStorage] = useState(false);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const driver = useRef<Driver | null>(null);
  const latest = useRef(data); latest.current = data;
  const baseline = useRef(data);
  const saved = useRef('');
  const writing = useRef(false);
  const mounted = useRef(false);
  const recovering = useRef(false);
  const writeRevision = useRef(0);
  const saveWaiters = useRef(new Set<SaveWaiter>());
  const persistenceState = useRef({ status, error, needsRecovery });
  persistenceState.current = { status, error, needsRecovery };
  const settleWaiters = useCallback((failure?: Error) => {
    for (const waiter of saveWaiters.current) {
      clearTimeout(waiter.timer);
      if (failure) waiter.reject(failure); else waiter.resolve();
    }
    saveWaiters.current.clear();
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const hydrationStart = latest.current;
    void (async () => {
      let connection: Driver | null = null;
      const fallback = typeof indexedDB === 'undefined';
      try {
        // A failed primary open must not turn a possibly existing journal into
        // an apparently new, empty fallback journal.
        connection = fallback ? fallbackDriver() : await openDriver();
        if (cancelled) { connection.close(); return; }
        driver.current = connection;
        setLimitedStorage(fallback);
        const existing = await connection.read();
        const stored = fallback ? existing : await promoteFallback(connection, existing);
        if (cancelled) return;
        baseline.current = stored ?? hydrationStart;
        if (stored) {
          saved.current = JSON.stringify(stored);
          setData(current => mergePersonalData(hydrationStart, current, stored));
        }
        setNeedsRecovery(false);
        setReady(true); setStatus(stored ? 'saved' : 'saving');
      } catch {
        if (cancelled) return;
        // Do not replace a record that failed to load with an empty snapshot.
        driver.current = null; connection?.close();
        setNeedsRecovery(true);
        setReady(true); setStatus('error');
        setError('Your saved data could not be opened. Keep this tab open and export a copy before reloading.');
      }
    })();
    return () => {
      cancelled = true; mounted.current = false;
      settleWaiters(new Error('The app closed before your latest changes could be saved.'));
      driver.current?.close(); driver.current = null; writing.current = false;
    };
  }, [settleWaiters]);

  useEffect(() => {
    if (!ready || !driver.current || writing.current) return;
    if (JSON.stringify(data) === saved.current) { setStatus('saved'); setError(''); return; }
    // Start the IDB transaction immediately; debouncing risks losing the final
    // message when the user closes the app just after sending it.
    const desired = data;
    const connection = driver.current;
    writeRevision.current += 1;
    writing.current = true; setStatus('saving'); setError('');
    let succeeded = false;
    void connection.write(baseline.current, desired).then(committed => {
      if (!mounted.current || driver.current !== connection) return;
      baseline.current = committed; saved.current = JSON.stringify(committed);
      setData(current => equal(current, desired) ? committed : mergePersonalData(desired, current, committed));
      setStatus(equal(latest.current, desired) ? 'saved' : 'saving');
      succeeded = true;
      try { localStorage.setItem(CHANGE_KEY, `${Date.now()}-${Math.random()}`); } catch { /* IndexedDB already committed. */ }
    }).catch(() => {
      if (mounted.current && driver.current === connection) { setStatus('error'); setError('Your latest changes could not be saved. Keep this tab open, export a backup, and free some device storage before retrying.'); }
    }).finally(() => {
      if (!mounted.current || driver.current !== connection) return;
      writing.current = false;
      if (mounted.current && succeeded) setAttempt(value => value + 1);
    });
  }, [data, ready, attempt]);

  useEffect(() => {
    const refresh = () => {
      if (!driver.current || writing.current || !ready) return;
      const connection = driver.current;
      const revision = writeRevision.current;
      void connection.read().then(remote => {
        if (!remote || !mounted.current || writing.current || driver.current !== connection || revision !== writeRevision.current) return;
        const original = baseline.current;
        baseline.current = remote; saved.current = JSON.stringify(remote);
        setData(current => mergePersonalData(original, current, remote));
      }).catch(() => {}); // Existing data remains usable; a later write reports any storage failure.
    };
    const changed = (event: StorageEvent) => { if (event.key === CHANGE_KEY) refresh(); };
    window.addEventListener('storage', changed); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', changed); window.removeEventListener('focus', refresh); };
  }, [ready]);

  const setProfile: Dispatch<SetStateAction<Profile>> = useCallback(value => setData(current => ({ ...current, profile: typeof value === 'function' ? value(current.profile) : value })), []);
  const setSessions: Dispatch<SetStateAction<Session[]>> = useCallback(value => setData(current => ({ ...current, sessions: typeof value === 'function' ? value(current.sessions) : value })), []);
  const setPracticeDays: Dispatch<SetStateAction<string[]>> = useCallback(value => setData(current => ({ ...current, practiceDays: typeof value === 'function' ? value(current.practiceDays) : value })), []);
  const setDayNotes: Dispatch<SetStateAction<Record<string, string>>> = useCallback(value => setData(current => ({ ...current, dayNotes: typeof value === 'function' ? value(current.dayNotes) : value })), []);
  const restoreData = useCallback((incoming: PersonalData) => {
    if (!validPersonalData(incoming)) throw new Error('The imported data is invalid.');
    setData(current => mergePersonalData(EMPTY, normalize(incoming), current));
  }, []);
  const retrySave = useCallback(() => {
    if (!mounted.current || recovering.current) return;
    if (driver.current) { setStatus('saving'); setError(''); setAttempt(value => value + 1); return; }
    recovering.current = true;
    setStatus('loading');
    let recovery: Driver | null = null;
    const fallback = typeof indexedDB === 'undefined';
    void (fallback ? Promise.resolve(fallbackDriver()) : openDriver()).then(async connection => {
      recovery = connection;
      const existing = await connection.read();
      const remote = fallback ? existing : await promoteFallback(connection, existing);
      if (!mounted.current) { connection.close(); return; }
      driver.current = connection;
      setLimitedStorage(fallback); setNeedsRecovery(false);
      const original = baseline.current;
      if (remote) {
        baseline.current = remote; saved.current = JSON.stringify(remote);
        setData(current => mergePersonalData(original, current, remote));
      }
      setError(''); setStatus(remote ? 'saved' : 'saving'); setAttempt(value => value + 1);
    }).catch(() => { recovery?.close(); if (mounted.current) { setNeedsRecovery(true); setStatus('error'); setError('Your saved data still cannot be opened. Export a copy before reloading.'); } }).finally(() => { recovering.current = false; });
  }, []);
  const flush = useCallback((): Promise<void> => {
    if (!mounted.current) return Promise.reject(new Error('The app closed before your latest changes could be saved.'));
    const current = persistenceState.current;
    if (current.status === 'error' || current.needsRecovery) return Promise.reject(new Error(current.error || 'Your saved data could not be opened. Keep this tab open and export a copy before reloading.'));
    return new Promise((resolve, reject) => {
      const waiter: SaveWaiter = {
        resolve, reject,
        timer: setTimeout(() => {
          saveWaiters.current.delete(waiter);
          reject(new Error('Saving is taking longer than expected. Keep this tab open and retry before loading the reader.'));
        }, 15_000),
      };
      saveWaiters.current.add(waiter);
      // Never resolve from the current callback's snapshot: a state update in
      // this same event may not have reached React's commit yet.
      setAttempt(value => value + 1);
    });
  }, []);
  const requestDurability = useCallback(async () => { try { return await navigator.storage?.persist?.() ?? false; } catch { return false; } }, []);
  const serialized = useMemo(() => JSON.stringify(data), [data]);
  const isCurrentDataSaved = ready && !needsRecovery && !!driver.current && !writing.current && status === 'saved' && saved.current === serialized;
  useEffect(() => {
    if (!saveWaiters.current.size || writing.current) return;
    if (status === 'error' || needsRecovery) settleWaiters(new Error(error || 'Your latest changes could not be saved.'));
    else if (isCurrentDataSaved) settleWaiters();
  }, [attempt, serialized, ready, status, error, needsRecovery, isCurrentDataSaved, settleWaiters]);
  return { ...data, isCurrentDataSaved, setProfile, setSessions, setPracticeDays, setDayNotes, restoreData, ready, status, error, limitedStorage, needsRecovery, retrySave, flush, requestDurability };
}
