type ReturnStorage = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'eva-reader-return';
const readerTabs = new Set(['#chat', '#calendar', '#journal', '#breathe', '#cards', '#rituals']);

/** A return target can never be a URL, auth callback, or transfer capability. */
export function validReaderReturnHash(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  if (readerTabs.has(value)) return value;
  return /^#reading\/[^\u0000-\u0020\u007f?#]+$/u.test(value) ? value : null;
}
function browserStorage(): ReturnStorage | undefined {
  try { return typeof sessionStorage === 'undefined' ? undefined : sessionStorage; }
  catch { return undefined; }
}
export function readReaderReturn(storage: ReturnStorage | undefined = browserStorage()): string {
  try { return validReaderReturnHash(storage?.getItem(KEY)) || '#chat'; }
  catch { return '#chat'; }
}
export function rememberReaderReturn(hash: string, storage: ReturnStorage | undefined = browserStorage()): boolean {
  const valid = validReaderReturnHash(hash);
  if (!valid || !storage) return false;
  try { storage.setItem(KEY, valid); return storage.getItem(KEY) === valid; }
  catch { return false; }
}
