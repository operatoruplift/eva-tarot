import { normalizeDay, validPersonalData } from './storage.ts';
import type { PersonalData, Session } from './storage.ts';

const IMPORTED_NOTE_SEPARATOR = '\n\n— Imported note —\n\n';
const MAX_DAY_NOTE_LENGTH = 20_000;

// Object key order is not part of a backup's identity. Message order is.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ value.charCodeAt(index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/** Import is additive: a backup has no authority to overwrite current edits. */
export function mergeImportedData(current: PersonalData, incoming: PersonalData): PersonalData {
  if (!validPersonalData(current) || !validPersonalData(incoming)) throw new Error('The imported data is invalid.');

  const sessions = new Map(current.sessions.map(session => [session.id, session]));
  const sourceSessions = new Map(incoming.sessions.map(session => [session.id, session]));
  const importedIds = new Map<string, string>();
  const resolving = new Set<string>();
  const importSession = (source: Session): string => {
    const previousId = importedIds.get(source.id);
    if (previousId !== undefined) return previousId;
    if (resolving.has(source.id)) throw new Error('The imported data is invalid.');
    resolving.add(source.id);
    // Resolve parents first, regardless of backup order. A revision must link
    // to its imported original, which may now live under a copied ID.
    const parent = source.revisedFrom ? sourceSessions.get(source.revisedFrom) : undefined;
    const session = parent ? { ...source, revisedFrom: importSession(parent) } : source;
    const remember = (id: string): string => { importedIds.set(source.id, id); resolving.delete(source.id); return id; };
    const existing = sessions.get(session.id);
    if (!existing) { sessions.set(session.id, session); return remember(session.id); }
    if (canonical(existing) === canonical(session)) return remember(session.id);
    const baseId = `import-${fingerprint(canonical(source))}`;
    // A collision never replaces a different record. Repeating the same import
    // finds the identical saved copy and does not create another conversation.
    for (let suffix = 0; ; suffix += 1) {
      const id = suffix ? `${baseId}-${suffix}` : baseId;
      // Generated IDs must not occupy another incoming record's original ID.
      if (sourceSessions.has(id) && id !== source.id) continue;
      const copy: Session = { ...session, id, title: `${session.title} (imported copy)` };
      const other = sessions.get(id);
      if (!other) { sessions.set(id, copy); return remember(id); }
      if (canonical(other) === canonical(copy)) return remember(id);
    }
  };
  for (const session of incoming.sessions) importSession(session);

  const dayNotes = { ...current.dayNotes };
  for (const [day, note] of Object.entries(incoming.dayNotes)) {
    const existing = dayNotes[day];
    if (note === '' && existing !== undefined) continue;
    // A backup may already contain several imported variants. Merge their
    // individual contents so exporting and importing again cannot repeat them.
    const variants = new Set([
      ...(existing ? existing.split(IMPORTED_NOTE_SEPARATOR) : []),
      ...note.split(IMPORTED_NOTE_SEPARATOR),
    ]);
    const combined = [...variants].join(IMPORTED_NOTE_SEPARATOR);
    if (combined.length > MAX_DAY_NOTE_LENGTH) {
      throw new Error('Some calendar notes are too long to combine safely. Shorten the conflicting notes before importing. Nothing was imported.');
    }
    dayNotes[day] = combined;
  }

  const result: PersonalData = {
    profile: {
      ...incoming.profile,
      ...current.profile,
      name: current.profile.name || incoming.profile.name,
      onboarded: current.profile.onboarded || incoming.profile.onboarded,
      ...(current.profile.avatar ? { avatar: current.profile.avatar } : incoming.profile.avatar ? { avatar: incoming.profile.avatar } : {}),
    },
    sessions: [...sessions.values()].sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    practiceDays: [...new Set([...current.practiceDays, ...incoming.practiceDays].map(day => normalizeDay(day)!))],
    dayNotes,
  };
  if (!validPersonalData(result)) throw new Error('The imported data is invalid.');
  return result;
}
