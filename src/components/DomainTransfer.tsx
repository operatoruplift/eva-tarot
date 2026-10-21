import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { createDataExport, parseDataImport } from '../lib/persistence';
import type { PersonalData } from '../lib/storage';
import { useLanguage } from '../lib/i18n';

export const TRANSFER_SOURCE_ORIGINS = ['https://evatarot.vercel.app', 'https://evara-omega.vercel.app'] as const;
export const TRANSFER_DESTINATION_ORIGIN = 'https://evatarot.xyz';
const WALLET_KEY = 'eva-commerce-device';
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
type Imported = ReturnType<typeof parseDataImport>;
type WalletTransfer = { state: 'present'; token: string } | { state: 'none' | 'unavailable' };
type WalletResult = 'copied' | 'unchanged' | 'conflict' | 'unavailable' | 'not_present';
type Status = '' | 'opening' | 'saving' | 'failed' | 'blocked' | 'done' | 'conflict' | 'wallet_unavailable';
type PendingAck = { opener: Window; origin: string; nonce: string; wallet: WalletResult };

/** Read an existing wallet only. A data transfer must never create a new one. */
export function readTransferWallet(storage: Pick<Storage, 'getItem'>): WalletTransfer {
  try {
    const token = storage.getItem(WALLET_KEY);
    if (token === null) return { state: 'none' };
    return validToken(token) ? { state: 'present', token } : { state: 'unavailable' };
  } catch { return { state: 'unavailable' }; }
}

/** Keep a different destination wallet: replacing its secret would hide its orders and credits. */
export function saveTransferWallet(incoming: WalletTransfer, storage: Pick<Storage, 'getItem' | 'setItem'>): WalletResult {
  if (incoming.state === 'none') return 'not_present';
  if (incoming.state !== 'present' || !validToken(incoming.token)) return 'unavailable';
  try {
    const existing = storage.getItem(WALLET_KEY);
    if (existing === incoming.token) return 'unchanged';
    if (existing !== null) return 'conflict';
    storage.setItem(WALLET_KEY, incoming.token);
    return storage.getItem(WALLET_KEY) === incoming.token ? 'copied' : 'unavailable';
  } catch { return 'unavailable'; }
}

function validWallet(value: unknown): value is WalletTransfer {
  if (!value || typeof value !== 'object') return false;
  const wallet = value as Record<string, unknown>;
  return wallet.state === 'none' || wallet.state === 'unavailable' || (wallet.state === 'present' && validToken(wallet.token));
}
const resultStatus = (wallet: WalletResult): Status => wallet === 'conflict' ? 'conflict' : wallet === 'unavailable' ? 'wallet_unavailable' : 'done';

/** A user-initiated handoff between exact first-party origins. No journal text or
 * wallet secret enters a URL or server. The old browser copy is always retained.
 * onImport resolves only after the imported journal has been durably committed. */
export function DomainTransfer({ data, language, saved, onImport }: { data: PersonalData; language: string; saved: boolean; onImport: (data: Imported) => Promise<void> }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>('');
  const [pendingAck, setPendingAck] = useState<PendingAck | null>(null);
  const latest = useRef({ data, language, onImport }); latest.current = { data, language, onImport };
  const cleanup = useRef<() => void>(() => {});
  const sourceOrigin = (TRANSFER_SOURCE_ORIGINS as readonly string[]).includes(window.location.origin);
  const copy = (english: string, vietnamese: string) => language === 'vi' ? vietnamese : t(english);

  useEffect(() => {
    const nonce = window.location.hash.match(/^#transfer\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/)?.[1];
    if (window.location.origin !== TRANSFER_DESTINATION_ORIGIN || !nonce || !window.opener) return;
    const opener = window.opener as Window;
    let received = false;
    let active = true;
    const receive = async (event: MessageEvent) => {
      if (!active || received || !(TRANSFER_SOURCE_ORIGINS as readonly string[]).includes(event.origin) || event.source !== opener || event.data?.type !== 'eva-transfer-data' || event.data.nonce !== nonce || typeof event.data.payload !== 'string') return;
      // Older app versions have no wallet field; they can still move their journal.
      if (event.data.wallet !== undefined && !validWallet(event.data.wallet)) return;
      try {
        const imported = parseDataImport(event.data.payload);
        received = true;
        clearInterval(timer);
        clearTimeout(timeout);
        setStatus('saving');
        await latest.current.onImport(imported);
        if (!active) return;
        let wallet: WalletResult;
        try { wallet = saveTransferWallet(event.data.wallet ?? { state: 'unavailable' }, localStorage); }
        catch { wallet = 'unavailable'; }
        setPendingAck({ opener, origin: event.origin, nonce, wallet });
      } catch { if (active) setStatus('failed'); }
    };
    const announce = () => {
      if (active && !received) for (const origin of TRANSFER_SOURCE_ORIGINS) opener.postMessage({ type: 'eva-transfer-ready', nonce }, origin);
    };
    window.addEventListener('message', receive);
    const timer = setInterval(announce, 1000);
    const timeout = setTimeout(() => { clearInterval(timer); if (!received && active) { window.removeEventListener('message', receive); setStatus('failed'); } }, 60_000);
    announce();
    return () => { active = false; window.removeEventListener('message', receive); clearInterval(timer); clearTimeout(timeout); };
  }, []);
  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (!pendingAck || !saved) return;
    pendingAck.opener.postMessage({ type: 'eva-transfer-done', nonce: pendingAck.nonce, journal: 'saved', wallet: pendingAck.wallet }, pendingAck.origin);
    setStatus(resultStatus(pendingAck.wallet));
    setPendingAck(null);
  }, [pendingAck, saved]);

  function move() {
    if (!sourceOrigin) return;
    cleanup.current();
    const nonce = crypto.randomUUID();
    const destination = window.open(`${TRANSFER_DESTINATION_ORIGIN}/#transfer/${nonce}`, `eva-tarot-transfer-${nonce}`);
    if (!destination) { setStatus('blocked'); return; }
    setStatus('opening');
    const receive = (event: MessageEvent) => {
      if (event.origin !== TRANSFER_DESTINATION_ORIGIN || event.source !== destination || event.data?.nonce !== nonce) return;
      if (event.data.type === 'eva-transfer-ready') {
        let wallet: WalletTransfer;
        try { wallet = readTransferWallet(localStorage); } catch { wallet = { state: 'unavailable' }; }
        destination.postMessage({ type: 'eva-transfer-data', nonce, payload: createDataExport(latest.current.data, latest.current.language), wallet }, TRANSFER_DESTINATION_ORIGIN);
      }
      if (event.data.type === 'eva-transfer-done' && event.data.journal === 'saved' && ['copied', 'unchanged', 'conflict', 'unavailable', 'not_present'].includes(event.data.wallet)) {
        setStatus(resultStatus(event.data.wallet)); cleanup.current();
      }
    };
    const timer = setTimeout(() => { cleanup.current(); setStatus('failed'); }, 60_000);
    cleanup.current = () => { window.removeEventListener('message', receive); clearTimeout(timer); };
    window.addEventListener('message', receive);
  }
  if (!sourceOrigin && !status) return null;
  const messages: Record<Status, string> = {
    '': copy('Eva Tarot has a new home at evatarot.xyz. Copy your saved readings and wallet there.', 'Eva Tarot đã có địa chỉ mới evatarot.xyz. Sao chép các bài đọc đã lưu và ví của bạn sang đó.'),
    opening: copy('Opening your new space… Keep this tab open until the copy finishes.', 'Đang mở không gian mới… Hãy giữ tab này mở cho đến khi sao chép xong.'),
    saving: copy('Saving your readings at the new address…', 'Đang lưu các bài đọc của bạn ở địa chỉ mới…'),
    failed: copy('The copy could not be confirmed. Your old data is still here. Try again, or export a journal backup and import it at evatarot.xyz.', 'Chưa thể xác nhận việc sao chép. Dữ liệu cũ của bạn vẫn ở đây. Hãy thử lại, hoặc xuất bản sao lưu nhật ký rồi nhập tại evatarot.xyz.'),
    blocked: copy('Allow the new tab to open, then try again. Your old data is still here.', 'Hãy cho phép mở tab mới rồi thử lại. Dữ liệu cũ của bạn vẫn ở đây.'),
    done: copy('Your readings are saved at the new address. Your wallet is ready there if you had one. Your old copy is still available.', 'Các bài đọc đã được lưu ở địa chỉ mới. Ví của bạn cũng đã sẵn sàng ở đó nếu có. Bản cũ vẫn còn nguyên.'),
    conflict: copy('Your readings were copied. The new address already has a different wallet, so it was kept. Your previous wallet and its credits remain at the old address.', 'Các bài đọc đã được sao chép. Địa chỉ mới đã có một ví khác nên ví đó được giữ nguyên. Ví trước và số lượt đọc của ví đó vẫn ở địa chỉ cũ.'),
    wallet_unavailable: copy('Your readings were copied, but your wallet could not be copied. Keep the old address for its orders and credits. A journal backup does not include your wallet.', 'Các bài đọc đã được sao chép nhưng chưa sao chép được ví. Hãy giữ địa chỉ cũ để xem đơn hàng và số lượt đọc. Bản sao lưu nhật ký không bao gồm ví.'),
  };
  return <div className="transfer-banner" role="status"><span>{messages[status]}</span>{sourceOrigin && <button onClick={move}>{copy('Copy to new address', 'Sao chép sang địa chỉ mới')}<ArrowUpRight size={13}/></button>}</div>;
}
