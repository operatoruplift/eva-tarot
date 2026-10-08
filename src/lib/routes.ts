export type AppView = 'home' | 'chat' | 'calendar' | 'breathe' | 'journal' | 'learn' | 'rituals';
export type MissingReadingReason = 'missing' | 'invalid';
export type ResolvedRoute =
  | { view: Exclude<AppView, 'chat'> }
  | { view: 'chat'; sessionId: string }
  | { view: 'missing'; reason: MissingReadingReason };

const viewRoutes: Record<AppView, string> = {
  home: 'chat', chat: 'reading', calendar: 'calendar', breathe: 'breathe',
  journal: 'journal', learn: 'cards', rituals: 'rituals',
};

/** A whole saved ID is one encoded route segment, including imported IDs. */
export function routeHash(view: AppView, id?: string): string {
  if (view === 'chat') {
    if (!id) return '#chat';
    try { return `#reading/${encodeURIComponent(id)}`; }
    // A malformed Unicode ID in an old backup must not crash navigation.
    catch { return '#reading/'; }
  }
  return `#${viewRoutes[view]}`;
}

/** Resolve only after the journal is hydrated; a URL never creates a record. */
export function readRoute(hash: string, sessions: readonly { id: string }[]): ResolvedRoute {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value) return { view: 'home' };
  if (value === 'reading' || value.startsWith('reading/')) {
    const rawId = value.slice('reading/'.length);
    if (!rawId) return { view: 'missing', reason: 'invalid' };
    let decodedId: string;
    try {
      decodedId = decodeURIComponent(rawId);
    } catch {
      // Older app versions wrote unescaped IDs, including literal percent signs.
      return sessions.some(session => session.id === rawId)
        ? { view: 'chat', sessionId: rawId }
        : { view: 'missing', reason: 'invalid' };
    }
    const match = sessions.find(session => session.id === decodedId)
      ?? sessions.find(session => session.id === rawId);
    return match ? { view: 'chat', sessionId: match.id } : { view: 'missing', reason: 'missing' };
  }
  const view = (Object.keys(viewRoutes) as AppView[]).find(candidate => candidate !== 'chat' && viewRoutes[candidate] === value);
  return view ? { view: view as Exclude<AppView, 'chat'> } : { view: 'missing', reason: 'invalid' };
}

/** Support copied path-style links without rewriting API or static-asset URLs. */
export function legacyPathHash(pathname: string): string | null {
  if (pathname === '/reading' || pathname.startsWith('/reading/')) return `#${pathname.slice(1)}`;
  const route = pathname.slice(1).replace(/\/$/, '');
  return Object.entries(viewRoutes).some(([view, name]) => view !== 'chat' && name === route)
    ? `#${route}` : null;
}
