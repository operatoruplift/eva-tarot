import { useEffect, useRef, useState } from 'react';
import { validDayNotes, validPracticeDays, validProfile, validSessions } from './storage.ts';
import type { Profile, Session } from './storage.ts';

export type CloudDocument = { profile: Profile; sessions: Session[]; practiceDays?: string[]; dayNotes?: Record<string, string>; language?: string };
type CloudStatus = 'disabled' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
export type CloudJournal = {
  available: boolean; enabled: boolean; status: CloudStatus; error: string;
  lastSynced: string | null; conflict: boolean;
  enable: () => void; retry: () => void; disconnect: () => void;
};
const TOKEN_KEY = 'evara-private-backup-token';
const ENABLED_KEY = 'evara-private-backup-enabled';
const BASELINE_KEY = 'evara-private-backup-baseline';
const MAX_BYTES = 1_048_576;
const env = import.meta.env ?? {};
const endpoint = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(endpoint && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(endpoint) && publishableKey);

export function makeDeviceToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function readToken(onlyEnabled = false): string | null {
  try {
    if (onlyEnabled && localStorage.getItem(ENABLED_KEY) !== 'true') return null;
    const token = localStorage.getItem(TOKEN_KEY);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch { return null; }
}
export function isCloudDocument(value: unknown): value is CloudDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as CloudDocument;
  return validProfile(doc.profile) && validSessions(doc.sessions)
    && (doc.practiceDays === undefined || validPracticeDays(doc.practiceDays))
    && (doc.dayNotes === undefined || validDayNotes(doc.dayNotes))
    && (doc.language === undefined || (typeof doc.language === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(doc.language)))
    && new TextEncoder().encode(JSON.stringify(doc)).byteLength <= MAX_BYTES;
}
function readBaseline(token: string): CloudDocument | null {
  try {
    const stored = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
    return stored?.connection === token.slice(0, 16) && isCloudDocument(stored.document) ? stored.document : null;
  } catch { return null; }
}
function saveBaseline(token: string, document: CloudDocument): void {
  // A missing baseline is safe: the next restoration asks before resolving
  // differences. It must never interpret missing storage as no local edits.
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify({ connection: token.slice(0, 16), document })); }
  catch { /* The conservative conflict check keeps both versions untouched. */ }
}
export function hasCloudConflict(local: CloudDocument, remote: CloudDocument, baseline: CloudDocument | null): boolean {
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  if (differs(local.profile, remote.profile) && (!baseline || (differs(local.profile, baseline.profile) && differs(remote.profile, baseline.profile)))) return true;
  for (const [day, note] of Object.entries(local.dayNotes ?? {})) {
    const other = remote.dayNotes?.[day]; const original = baseline?.dayNotes?.[day];
    if (other !== undefined && note !== other && (original === undefined || (note !== original && other !== original))) return true;
  }
  if (local.language && remote.language && local.language !== remote.language && (!baseline || (local.language !== baseline.language && remote.language !== baseline.language))) return true;
  const originals = new Map(baseline?.sessions.map((session) => [session.id, session]) ?? []);
  const localById = new Map(local.sessions.map((session) => [session.id, session]));
  return remote.sessions.some((session) => {
    const localSession = localById.get(session.id);
    const original = originals.get(session.id);
    return localSession && differs(localSession, session) && (!original || (differs(localSession, original) && differs(session, original)));
  });
}
/** Cloud wins existing IDs at startup; new local readings are never discarded. */
export function mergeCloudDocument(local: CloudDocument, remote: CloudDocument): CloudDocument {
  const sessions = new Map(local.sessions.map((session) => [session.id, session]));
  for (const session of remote.sessions) sessions.set(session.id, session);
  return {
    profile: remote.profile, sessions: [...sessions.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    practiceDays: [...new Set([...(local.practiceDays ?? []), ...(remote.practiceDays ?? [])])],
    dayNotes: { ...local.dayNotes, ...remote.dayNotes }, language: remote.language ?? local.language,
  };
}
/** Use the durable last-synced document as start to retain offline edits too. */
export function restoreCloudDocument(start: CloudDocument, current: CloudDocument, remote: CloudDocument): CloudDocument {
  const restored = mergeCloudDocument(current, remote);
  const original = new Map(start.sessions.map((session) => [session.id, JSON.stringify(session)]));
  const changed = new Map(current.sessions.filter((session) => original.get(session.id) !== JSON.stringify(session)).map((session) => [session.id, session]));
  const dayNotes = { ...restored.dayNotes };
  for (const [day, note] of Object.entries(current.dayNotes ?? {})) {
    if (note !== start.dayNotes?.[day]) dayNotes[day] = note;
  }
  return {
    ...restored, dayNotes, language: current.language !== start.language ? current.language : restored.language,
    profile: JSON.stringify(start.profile) === JSON.stringify(current.profile) ? restored.profile : current.profile,
    sessions: restored.sessions.map((session) => changed.get(session.id) ?? session),
  };
}
class BackupError extends Error {
  code: number;
  constructor(message: string, code: number) { super(message); this.code = code; }
}
type Remote = { document: CloudDocument | null; revision: number; updatedAt: string | null };

async function requestBackup(token: string, signal: AbortSignal, write?: { document: CloudDocument; expectedRevision: number }): Promise<Remote> {
  if (write && !isCloudDocument(write.document)) throw new BackupError('This journal is too large for private backup. Export it to keep a copy; your readings remain on this device.', 413);
  const response = await fetch(`${endpoint}/functions/v1/journal`, {
    method: write ? 'PUT' : 'GET', signal, cache: 'no-store', credentials: 'omit',
    headers: { apikey: publishableKey, 'X-Evara-Device': token, ...(write ? { 'Content-Type': 'application/json' } : {}) },
    ...(write ? { body: JSON.stringify(write) } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Private backup is unavailable. Your journal is still on this device.';
    throw new BackupError(message, response.status);
  }
  if (!data || typeof data !== 'object') throw new BackupError('The backup response could not be read. Your local journal is safe.', 502);
  const remote = data as Remote;
  if (!Number.isSafeInteger(remote.revision) || remote.revision < 0 || (remote.document !== null && !isCloudDocument(remote.document))) throw new BackupError('The backup response could not be read. Your local journal is safe.', 502);
  return remote;
}

export function useCloudJournal({ profile, sessions, practiceDays, dayNotes, language, ready = true, onRestore }: CloudDocument & { ready?: boolean; onRestore: (document: CloudDocument) => void }): CloudJournal {
  const [token, setToken] = useState(() => readToken(true));
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<CloudStatus>(token ? 'connecting' : 'disabled');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ profile, sessions, practiceDays, dayNotes, language, onRestore });
  latest.current = { profile, sessions, practiceDays, dayNotes, language, onRestore };
  const revision = useRef(0);
  const lastWritten = useRef('');
  const operation = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const rebaseOnRetry = useRef(false);
  const epoch = useRef(0);
  const observedBaseline = useRef<{ connection: string | null; document: CloudDocument | null } | null>(null);
  if (!observedBaseline.current) {
    const connection = readToken();
    observedBaseline.current = { connection, document: connection ? readBaseline(connection) : null };
  }

  useEffect(() => {
    const connected = () => { setOnline(navigator.onLine); if (navigator.onLine) setAttempt((value) => value + 1); };
    const connectionChanged = (event: StorageEvent) => {
      if (event.key !== ENABLED_KEY && event.key !== TOKEN_KEY && event.key !== null) return;
      epoch.current++; operation.current?.abort();
      const connection = readToken(true);
      setToken(connection); setHydrated(false); setConflict(false); setError('');
      setStatus(connection ? 'connecting' : 'disabled');
    };
    window.addEventListener('online', connected); window.addEventListener('offline', connected);
    window.addEventListener('storage', connectionChanged);
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', connected); window.removeEventListener('storage', connectionChanged); operation.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!ready || !token || !configured || hydrated || !online) return;
    const controller = new AbortController(); operation.current = controller;
    const ticket = ++epoch.current;
    const startingDocument = { profile: latest.current.profile, sessions: latest.current.sessions, practiceDays: latest.current.practiceDays, dayNotes: latest.current.dayNotes, language: latest.current.language };
    setStatus('connecting'); setError('');
    const timeout = setTimeout(() => controller.abort(), 15_000);
    void requestBackup(token, controller.signal).then((remote) => {
      if (controller.signal.aborted || epoch.current !== ticket) return;
      const local = { profile: latest.current.profile, sessions: latest.current.sessions, practiceDays: latest.current.practiceDays, dayNotes: latest.current.dayNotes, language: latest.current.language };
      // Another tab may update localStorage's baseline while this tab still has
      // older state. Only use the baseline this mounted hook has observed.
      const baseline = observedBaseline.current?.connection === token ? observedBaseline.current.document : null;
      if (remote.document && !rebaseOnRetry.current && hasCloudConflict(local, remote.document, baseline)) {
        setConflict(true); setStatus('error');
        setError('This device and your cloud backup contain different edits. Both versions are intact. Choose this device’s version to continue backing up.');
        return;
      }
      // After an explicit conflict resolution, the user has chosen this device's
      // edits. Keep remote-only sessions while retaining local versions of IDs.
      const restored = remote.document
        ? rebaseOnRetry.current ? mergeCloudDocument(remote.document, local) : restoreCloudDocument(baseline ?? startingDocument, local, remote.document)
        : local;
      revision.current = remote.revision;
      lastWritten.current = remote.document ? JSON.stringify(remote.document) : '';
      observedBaseline.current = { connection: token, document: remote.document };
      if (remote.document) saveBaseline(token, remote.document);
      rebaseOnRetry.current = false;
      latest.current.onRestore(restored);
      setLastSynced(remote.updatedAt); setConflict(false); setHydrated(true); setStatus('synced');
    }).catch((cause: unknown) => {
      if (epoch.current !== ticket) return;
      setStatus('error'); setError(controller.signal.aborted ? 'Backup took too long. Your journal is safe on this device. Try again when connected.' : cause instanceof Error ? cause.message : 'Could not reach private backup. Try again.');
    }).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); epoch.current++; };
  }, [token, hydrated, online, attempt, ready]);

  useEffect(() => {
    if (!ready || !token || !configured || !hydrated || !online || conflict) return;
    const document = { profile, sessions, practiceDays, dayNotes, language };
    const serialized = JSON.stringify(document);
    if (serialized === lastWritten.current || inFlight.current) return;
    const ticket = epoch.current;
    const timer = setTimeout(() => {
      const controller = new AbortController(); operation.current = controller;
      inFlight.current = true; setStatus('syncing'); setError('');
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let saved = false;
      void requestBackup(token, controller.signal, { document, expectedRevision: revision.current }).then((remote) => {
        if (epoch.current !== ticket || controller.signal.aborted) return;
        revision.current = remote.revision; lastWritten.current = serialized;
        observedBaseline.current = { connection: token, document };
        saveBaseline(token, document);
        setLastSynced(remote.updatedAt); setStatus('synced'); saved = true;
      }).catch((cause: unknown) => {
        if (epoch.current !== ticket) return;
        setStatus('error'); setConflict(cause instanceof BackupError && cause.code === 409);
        setError(controller.signal.aborted ? 'Backup took too long. Your latest changes are still saved on this device.' : cause instanceof Error ? cause.message : 'Your changes are saved locally. Try private backup again.');
      }).finally(() => {
        clearTimeout(timeout); inFlight.current = false;
        // Only a successful write drains a newer edit; errors wait for retry or
        // a new local edit, preventing an unbounded retry loop while offline.
        if (saved && epoch.current === ticket) setAttempt((value) => value + 1);
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [profile, sessions, practiceDays, dayNotes, language, token, hydrated, online, conflict, attempt, ready]);

  function enable() {
    if (!configured) return;
    try {
      const next = readToken() ?? makeDeviceToken();
      localStorage.setItem(TOKEN_KEY, next); localStorage.setItem(ENABLED_KEY, 'true');
      setToken(next); setError(''); setHydrated(false); setStatus('connecting'); setAttempt((value) => value + 1);
    } catch { setStatus('error'); setError('This browser cannot save a private backup connection. Allow site storage, or export your journal instead.'); }
  }
  function disconnect() {
    try { localStorage.removeItem(ENABLED_KEY); }
    catch { setError('This browser could not pause backup. Please allow site storage and try again.'); return; }
    epoch.current++; operation.current?.abort(); setToken(null); setHydrated(false); setConflict(false); setStatus('disabled'); setError('');
  }
  function retry() {
    if (conflict) { rebaseOnRetry.current = true; setHydrated(false); setConflict(false); }
    setAttempt((value) => value + 1);
  }
  return { available: configured, enabled: Boolean(token), status: token && !online ? 'offline' : status, error, conflict, lastSynced, enable, retry, disconnect };
}
