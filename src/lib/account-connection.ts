/** Local capabilities are private credentials. Never put this record in a URL,
 * analytics, a journal export, or an application log. */
export const CONNECTION_KEY = 'eva-account-connection-v1';
export const CONNECTION_EVENT = 'eva-connection-change';
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type GuestConnection = { scope: string | null; commerceToken: string; backupToken: string | null; backupEnabled: boolean };
export type AccountConnection = { userId: string; email: string; commerceToken: string; backupToken: string; backupEnabled: boolean };
export type ConnectionState = { version: 1; guest: GuestConnection; account: AccountConnection | null };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export function validAccountConnection(value: unknown): value is AccountConnection {
  if (!value || typeof value !== 'object') return false;
  const v = value as AccountConnection;
  return UUID.test(v.userId) && typeof v.email === 'string' && v.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) && TOKEN.test(v.commerceToken) && TOKEN.test(v.backupToken) && typeof v.backupEnabled === 'boolean';
}
export function readConnection(store: Store = localStorage): ConnectionState | null {
  const raw = store.getItem(CONNECTION_KEY);
  if (raw === null) return null;
  let state: ConnectionState;
  try { state = JSON.parse(raw) as ConnectionState; } catch { throw new Error('Your saved connection could not be read. Keep your site data and try again.'); }
  const guest = state?.guest;
  if (state.version !== 1 || !guest || !(guest.scope === null || UUID.test(guest.scope)) || !TOKEN.test(guest.commerceToken) || !(guest.backupToken === null || TOKEN.test(guest.backupToken)) || typeof guest.backupEnabled !== 'boolean' || (state.account !== null && !validAccountConnection(state.account))) throw new Error('Your saved connection could not be read. Keep your site data and try again.');
  return state;
}
export function persistConnection(state: ConnectionState, store: Store = localStorage): void {
  const serialized = JSON.stringify(state);
  // Validate before replacing the one atomic active-connection record.
  readConnection({ getItem: () => serialized, setItem: () => {} });
  store.setItem(CONNECTION_KEY, serialized);
  if (store.getItem(CONNECTION_KEY) !== serialized) throw new Error('This browser could not save the account connection. Your current journal is unchanged.');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONNECTION_EVENT));
}
export function personalScope(state: ConnectionState | null = readConnection()): string | undefined {
  return state?.account ? `account-${state.account.userId}` : state?.guest.scope ?? undefined;
}
export function nextAccountConnection(guest: GuestConnection, account: AccountConnection, linkingGuest: boolean, makeToken: () => string, makeId: () => string): ConnectionState {
  if (!validAccountConnection(account)) throw new Error('The account connection could not be read.');
  return { version: 1, account, guest: linkingGuest ? { scope: makeId(), commerceToken: makeToken(), backupToken: null, backupEnabled: false } : guest };
}
export function guestFromBrowser(commerceToken: string, store: Store = localStorage): GuestConnection {
  const current = readConnection(store);
  if (current) return current.guest;
  const backup = store.getItem('evara-private-backup-token');
  return { scope: null, commerceToken, backupToken: backup && TOKEN.test(backup) ? backup : null, backupEnabled: store.getItem('evara-private-backup-enabled') === 'true' };
}
/** Stage a retry-stable backup connection without enabling uploads. A scoped
 * guest is authoritative: it must never inherit an earlier account's token. */
export function prepareLinkBackupToken(makeToken: () => string, store: Store = localStorage): string {
  const state = readConnection(store);
  if (state?.account) throw new Error('Sign out of the current device connection first.');
  const legacy = state ? null : store.getItem('evara-private-backup-token');
  const next = state?.guest.backupToken ?? (legacy && TOKEN.test(legacy) ? legacy : makeToken());
  if (!TOKEN.test(next)) throw new Error('The backup connection could not be prepared.');
  if (state) persistConnection({...state,guest:{...state.guest,backupToken:next}},store);
  else {
    store.setItem('evara-private-backup-token',next);
    if (store.getItem('evara-private-backup-token') !== next) throw new Error('This browser could not save the recovery connection.');
  }
  return next;
}
