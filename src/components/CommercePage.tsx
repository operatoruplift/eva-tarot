import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Heart, LoaderCircle, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import QRCode from 'qrcode';
import { buildVietQR } from '../lib/vietqr';
import { Brand, Logo } from './Brand';
import { Modal } from './Modal';
import { useLanguage } from '../lib/i18n';
import { CommerceError, commerceRequest, formatVnd, getWallet, orderReference } from '../lib/commerce';
import { canPurchaseProduct, PUBLIC_DONATION_DETAILS, PUBLIC_REFERENCE_CATALOG, publicDonationFallbackAllowed, publicDonationsAllowed } from '../lib/public-catalog';
import type { CommerceCatalog, CommerceOrder, CommerceProduct, CommerceSettings, WalletResponse } from '../lib/commerce';
import { createPaymentRefresh } from '../lib/payment-refresh';
import type { PaymentRefreshController, PaymentRefreshState } from '../lib/payment-refresh';
import './commerce.css';

function PaymentQR({ payload, fallback, label }: { payload?: string; fallback?: string; label: string }) {
  const [image, setImage] = useState<{ payload: string; url: string } | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true; setImage(null); setFailed(false);
    if (payload) void QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 4, width: 480 }).then(value => { if (current) setImage({ payload, url: value }); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [payload]);
  if (failed || (!payload && !fallback)) return <p className="commerce-muted">{label}</p>;
  const displayedImage = payload ? (image?.payload === payload ? image.url : undefined) : fallback;
  return displayedImage ? <img className="payment-qr" src={displayedImage} alt={label} onError={() => setFailed(true)} /> : <div className="payment-qr payment-qr-loading" role="status" aria-label={label}><LoaderCircle className="commerce-spin" /></div>;
}
function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false); const [error, setError] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); if (timeout.current) clearTimeout(timeout.current); timeout.current = setTimeout(() => setCopied(false), 2200); }
    catch { setError(true); }
  }
  return <span className="commerce-copy"><button type="button" className="commerce-icon" onClick={() => void copy()} aria-label={copied ? copiedLabel : label}>{copied ? <Check size={17} /> : <Copy size={17} />}</button>{error && <small role="status">{value}</small>}</span>;
}
export function CommercePage({ donationOnly = false, onStart, onHome }: { donationOnly?: boolean; onStart: () => void; onHome: () => void }) {
  const { language, formatDate } = useLanguage(); const vi = language === 'vi'; const tr = (en: string, vn: string) => vi ? vn : en;
  const [catalog, setCatalog] = useState<CommerceCatalog | null>(null); const [commerceAvailable, setCommerceAvailable] = useState(false); const [loading, setLoading] = useState(true); const [configurationMissing, setConfigurationMissing] = useState(false);
  const [wallet, setWallet] = useState<WalletResponse | null>(null); const [walletError, setWalletError] = useState('');
  const [paymentRefresh, setPaymentRefresh] = useState<PaymentRefreshState>({ phase: 'idle', lastCheckedAt: null });
  const refreshing = paymentRefresh.phase === 'checking';
  const [tab, setTab] = useState<'readings' | 'donation'>(donationOnly ? 'donation' : 'readings');
  const [product, setProduct] = useState<CommerceProduct | null>(null); const [donate, setDonate] = useState(false); const [amount, setAmount] = useState('50000'); const [email, setEmail] = useState('');
  const [order, setOrder] = useState<CommerceOrder | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const intent = useRef<string>(''); const mounted = useRef(true); const walletRefresh = useRef<PaymentRefreshController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setTab(donationOnly ? 'donation' : 'readings'); }, [donationOnly]);
  const refreshWallet = useCallback(async (afterChange = false) => {
    if (afterChange) await walletRefresh.current?.refreshAfterChange();
    else await walletRefresh.current?.refresh();
  }, []);
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try { const next = await commerceRequest<{ catalog: CommerceCatalog }>('catalog'); if (!Array.isArray(next.catalog?.products) || !next.catalog?.settings) throw new Error('Could not load the current prices.'); if (mounted.current) { setCatalog(next.catalog); setCommerceAvailable(true); setConfigurationMissing(false); } }
    catch (cause) { if (mounted.current) { setCommerceAvailable(false); setConfigurationMissing(cause instanceof CommerceError && cause.status === 503 && cause.message.startsWith('Payments are not configured')); } }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    const environment = () => ({ visible: document.visibilityState === 'visible', online: navigator.onLine !== false });
    const controller = createPaymentRefresh({
      ...environment(), load: getWallet,
      onData(next) { setWallet(next); setWalletError(''); setOrder(current => current ? next.orders.find(item => item.id === current.id) ?? current : null); },
      onError(cause) { setWalletError(cause instanceof Error ? cause.message : 'Could not load your orders.'); },
      onState: setPaymentRefresh,
    });
    walletRefresh.current = controller;
    const updateEnvironment = () => controller.setEnvironment(environment());
    const focus = () => { updateEnvironment(); void controller.resume(); };
    document.addEventListener('visibilitychange', updateEnvironment);
    window.addEventListener('online', updateEnvironment); window.addEventListener('offline', updateEnvironment); window.addEventListener('focus', focus);
    void controller.refresh();
    return () => {
      controller.stop(); walletRefresh.current = null;
      document.removeEventListener('visibilitychange', updateEnvironment);
      window.removeEventListener('online', updateEnvironment); window.removeEventListener('offline', updateEnvironment); window.removeEventListener('focus', focus);
    };
  }, []);
  const hasPendingPayment = Boolean(wallet?.orders.some(item => item.status === 'pending' || item.status === 'transfer_sent') || order?.status === 'pending' || order?.status === 'transfer_sent');
  useEffect(() => { walletRefresh.current?.setPending(hasPendingPayment); }, [hasPendingPayment]);
  const lastPaymentCheck = paymentRefresh.lastCheckedAt === null ? '' : formatDate(new Date(paymentRefresh.lastCheckedAt), { hour: 'numeric', minute: '2-digit' });
  const paymentUpdateNotice = paymentRefresh.phase === 'offline' ? tr('You’re offline. Reconnect to check payment status.', 'Bạn đang ngoại tuyến. Kết nối lại để kiểm tra thanh toán.')
    : paymentRefresh.phase === 'paused' ? tr('Automatic checks are paused. Tap refresh to check the latest payment status.', 'Đã tạm dừng kiểm tra tự động. Nhấn làm mới để xem trạng thái thanh toán mới nhất.')
    : paymentRefresh.phase === 'retrying' ? tr('The latest update could not be loaded. Eva will retry more slowly; you can also refresh.', 'Chưa tải được cập nhật mới nhất. Eva sẽ thử lại chậm hơn; bạn cũng có thể nhấn làm mới.')
    : paymentRefresh.phase === 'checking' && hasPendingPayment ? tr('Checking payment status…', 'Đang kiểm tra thanh toán…')
    : hasPendingPayment ? tr('Payment status updates every 15 seconds while this page is open. Eva’s team still verifies the transfer manually.', 'Trạng thái thanh toán được kiểm tra mỗi 15 giây khi trang đang mở. Đội ngũ Eva vẫn đối chiếu chuyển khoản thủ công.')
    : '';
  const displayedCatalog = catalog ?? PUBLIC_REFERENCE_CATALOG;
  const settings = displayedCatalog.settings; const isCredits = commerceAvailable && settings?.pricing_mode !== 'consultations';
  const products = displayedCatalog.products.filter(item => commerceAvailable ? item.active : true).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const canBuy = (item: CommerceProduct) => canPurchaseProduct(item, settings, commerceAvailable);
  const category = (item: CommerceProduct) => ({ questions: tr('Questions', 'Câu hỏi'), love: tr('Love & connection', 'Tình cảm'), work: tr('Work & studies', 'Học tập & công việc'), life: tr('Everyday life', 'Cuộc sống'), packages: tr('Reading packages', 'Các gói trải bài'), other: tr('Explore', 'Khám phá') } as Record<string, string>)[item.category || 'other'] || tr('Eva Tarot', 'Eva Tarot');
  const title = (item: CommerceProduct) => vi ? item.title_vi || item.title_en : item.title_en;
  const description = (item: CommerceProduct) => vi ? item.description_vi || item.description_en : item.description_en;
  const status = (item: CommerceOrder) => item.status === 'confirmed' ? tr('Payment confirmed', 'Đã xác nhận thanh toán') : item.status === 'transfer_sent' ? tr('Transfer reported · awaiting verification', 'Đã báo chuyển khoản · chờ xác nhận') : item.status === 'rejected' ? tr('Not approved', 'Chưa được duyệt') : tr('Awaiting payment · not verified', 'Chờ thanh toán · chưa xác nhận');
  function openCheckout(item: CommerceProduct | null) { if (!commerceAvailable || (item && !canBuy(item)) || (!item && !publicDonationsAllowed(settings))) return; setProduct(item); setDonate(!item); setOrder(null); setError(''); intent.current = crypto.randomUUID(); }
  function closeCheckout() { if (busy) return; setProduct(null); setDonate(false); setOrder(null); setError(''); }
  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; if (!commerceAvailable) { setError(tr('Checkout is unavailable. No order has been created.', 'Chưa thể thanh toán. Chưa có đơn nào được tạo.')); return; } setBusy(true); setError('');
    try {
      const result = await commerceRequest<{ order: CommerceOrder }>(donate ? 'create_donation' : 'create_order', { ...(donate ? { amountVnd: Number(amount) } : { productId: product?.id }), idempotencyKey: intent.current, ...(email.trim() ? { contactEmail: email.trim() } : {}) }, { device: true });
      if (!result.order?.id) throw new Error('Could not read your order. Refresh your orders before trying again.');
      setOrder(result.order); void refreshWallet(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Could not create your order.', 'Chưa tạo được đơn.')); }
    finally { setBusy(false); }
  }
  async function transferSent() {
    if (!order || busy) return; setBusy(true); setError('');
    try { const result = await commerceRequest<{ order?: CommerceOrder }>('transfer_sent', { orderId: order.id }, { device: true }); setOrder(result.order ?? { ...order, status: 'transfer_sent' }); await refreshWallet(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr('Could not report your transfer. Try again.', 'Chưa báo được chuyển khoản. Bạn thử lại nhé.')); }
    finally { setBusy(false); }
  }
  function resumeOrder(item: CommerceOrder) { setProduct(null); setDonate(item.kind === 'donation'); setOrder(item); setError(''); }
  const showCheckout = Boolean(product || donate || order);
  return <div className="commerce-page">
    <header className="commerce-header"><button className="commerce-brand" onClick={onHome} aria-label={tr('Eva Tarot home', 'Trang chủ Eva Tarot')}><Brand /></button><button className="commerce-button commerce-button-quiet" onClick={onStart}>{tr('Open Eva', 'Mở Eva')}<ArrowRight size={17} /></button></header>
    <main className="commerce-main">
      <button className="commerce-back" onClick={onHome}><ArrowLeft size={16} />{tr('Back to explore', 'Về trang khám phá')}</button>
      <div className="commerce-intro"><span className="commerce-eyebrow">{tr('A little space for yourself', 'Một khoảng nhỏ cho bạn')}</span><h1>{tab === 'donation' ? tr('Keep a little light going.', 'Góp một chút nắng.') : tr('A reading, at your pace.', 'Một trải bài, theo nhịp của bạn.')}</h1><p>{tab === 'donation' ? tr('If Eva has helped you pause and see things more clearly, you can support its upkeep with a contribution of your choice.', 'Nếu Eva giúp bạn chậm lại và nhìn mọi chuyện rõ hơn, bạn có thể góp một khoản tùy tâm để duy trì ứng dụng.') : tr('Choose what fits your question. See the full price before you pay, with no recurring subscription.', 'Chọn gói phù hợp với điều bạn muốn hỏi. Giá được hiển thị rõ trước khi thanh toán, không tự động gia hạn.')}</p></div>
      <div className="commerce-tabs" aria-label={tr('Payment options', 'Các lựa chọn thanh toán')}><button aria-pressed={tab === 'readings'} onClick={() => setTab('readings')}>{tr('Readings & pricing', 'Trải bài & bảng giá')}</button><button aria-pressed={tab === 'donation'} onClick={() => setTab('donation')}><Heart size={16} />{tr('Support Eva', 'Ủng hộ Eva')}</button></div>
      {loading ? <div className="commerce-state" role="status"><LoaderCircle className="commerce-spin" />{tr('Loading current prices…', 'Đang tải bảng giá…')}</div> : tab === 'readings' ? <>
        {!commerceAvailable && <div className="commerce-notice" role="status"><p>{tr('These are reference prices from Eva’s price list. Purchases and bookings are not open while payment tracking is unavailable.', 'Đây là giá tham khảo từ bảng giá của Eva. Chưa mở mua gói hoặc đặt lịch khi hệ thống theo dõi thanh toán chưa sẵn sàng.')}</p><button className="commerce-button commerce-button-quiet" onClick={() => void loadCatalog()}>{tr('Check availability', 'Kiểm tra lại')}</button></div>}
        {(vi ? settings?.announcement_vi : settings?.announcement_en) && <p className="commerce-notice">{String(vi ? settings?.announcement_vi : settings?.announcement_en)}</p>}
        {commerceAvailable && settings?.pricing_mode === 'free_trial' && <p className="commerce-notice">{tr(`New wallets receive ${settings.free_trial_credits ?? 0} free AI reply credit. Then choose a package when you want to continue.`, `Ví mới nhận ${settings.free_trial_credits ?? 0} lượt trả lời AI miễn phí. Khi muốn tiếp tục, bạn có thể chọn gói phù hợp.`)}</p>}
        {commerceAvailable && settings?.pricing_mode === 'consultations' && <p className="commerce-notice">{tr('AI chat is currently free. Credit packages are shown for reference and are not for sale yet.', 'Trò chuyện AI hiện miễn phí. Các gói lượt AI chỉ để tham khảo, chưa mở bán.')}</p>}
        {commerceAvailable && !settings?.pricing_mode && <p className="commerce-notice">{tr('Online checkout is not open yet. You can explore the prices and keep using Eva.', 'Thanh toán trực tuyến chưa mở. Bạn vẫn có thể xem bảng giá và tiếp tục dùng Eva.')}</p>}
        {products.length ? <div className="commerce-products">{products.map((item, index) => <article className={`commerce-product ${index === 1 ? 'commerce-product-featured' : ''}`} key={item.id}><div className="commerce-product-top"><Logo size={34} /><span>{category(item)}</span></div><h2>{title(item)}</h2>{description(item) && <p>{description(item)}</p>}<div className="commerce-price">{formatVnd(item.price_vnd, vi)}<small>{!commerceAvailable ? tr('reference price · not on sale', 'giá tham khảo · chưa mở bán') : item.kind === 'credits' ? `${item.credits} ${tr(item.credits === 1 ? 'AI reply credit' : 'AI reply credits', 'lượt trả lời AI')}` : tr('one-time payment', 'thanh toán một lần')}</small></div><button className="commerce-button" disabled={!canBuy(item)} onClick={() => openCheckout(item)}>{canBuy(item) ? tr('Choose this package', 'Chọn gói này') : tr('Not on sale yet', 'Chưa mở bán')}<ArrowRight size={17} /></button></article>)}</div> : <div className="commerce-state">{tr('There are no reading packages available right now.', 'Hiện chưa có gói trải bài nào được mở.')}</div>}
        {isCredits && <p className="commerce-notice">{tr('One credit pays for one completed AI reply, with any number of cards. Each follow-up reply uses one more credit. Replies that fail are not charged.', 'Một lượt dùng cho một câu trả lời AI hoàn tất, với bất kỳ số lá bài nào. Mỗi lần AI trả lời câu hỏi tiếp theo dùng thêm một lượt. Câu trả lời bị lỗi không bị trừ lượt.')}</p>}
        {commerceAvailable && <div className="commerce-reassurance"><ShieldCheck size={20} /><p>{tr('Bank transfers are checked by Eva’s team. A payment is confirmed only after the transfer is verified.', 'Đội ngũ Eva kiểm tra từng giao dịch chuyển khoản. Thanh toán chỉ được xác nhận sau khi đã đối chiếu.')}{!isCredits && ` ${tr('A consultation request is not an instant AI credit purchase.', 'Yêu cầu tư vấn không phải giao dịch mua lượt AI tức thì.')}`}</p></div>}
      </> : <section className="commerce-donation"><div className="commerce-donation-art"><Heart size={36} /><span>eva.</span><i>✧</i></div><div><span className="commerce-eyebrow">{tr('A voluntary thank-you', 'Một lời cảm ơn tùy tâm')}</span><h2>{tr('Every small kindness counts.', 'Một chút thôi cũng đáng quý.')}</h2><p>{tr('Your donation helps with the costs of running Eva. It is optional and does not purchase a reading or add credits.', 'Khoản ủng hộ giúp trang trải chi phí duy trì Eva. Việc ủng hộ hoàn toàn tự nguyện, không phải mua trải bài và không cộng lượt sử dụng.')}</p>{publicDonationsAllowed(settings) ? commerceAvailable ? <button className="commerce-button" onClick={() => openCheckout(null)}><Heart size={17} />{tr('Choose an amount', 'Chọn số tiền ủng hộ')}</button> : publicDonationFallbackAllowed(catalog?.settings, configurationMissing, Boolean(catalog)) ? <DirectDonation vi={vi} /> : <p className="commerce-notice">{tr('Donation checkout is temporarily unavailable. Please check back before sending a transfer.', 'Hiện chưa thể tạo giao dịch ủng hộ. Bạn vui lòng kiểm tra lại trước khi chuyển khoản.')}<button className="commerce-button commerce-button-quiet" onClick={() => void loadCatalog()}>{tr('Try again', 'Thử lại')}</button></p> : <p className="commerce-notice">{tr('Donations are paused.', 'Tạm ngưng nhận ủng hộ.')}</p>}</div></section>}
      <section className="commerce-wallet"><div className="commerce-section-head"><div><span className="commerce-eyebrow">{tr('On this device', 'Trên thiết bị này')}</span><h2><Wallet size={22} />{tr('Your orders', 'Đơn của bạn')}</h2></div><button className="commerce-icon" disabled={refreshing} onClick={() => void refreshWallet()} aria-label={tr('Refresh orders', 'Làm mới đơn')}><RefreshCw size={19} className={refreshing ? 'commerce-spin' : ''} /></button></div>{(paymentUpdateNotice || lastPaymentCheck) && <p className="commerce-muted" role="status">{paymentUpdateNotice}{lastPaymentCheck && <>{paymentUpdateNotice && <br />}{tr('Last checked', 'Kiểm tra gần nhất')}: {lastPaymentCheck}</>}</p>}{walletError && <p className="commerce-notice commerce-error" role="status">{wallet ? tr('Showing the last loaded orders and balance. Refresh for current payment status.', 'Đang hiển thị đơn và số lượt đã tải lần gần nhất. Nhấn làm mới để kiểm tra trạng thái hiện tại.') : tr('Your orders could not be loaded. Please refresh when you are connected.', 'Chưa tải được đơn của bạn. Hãy nhấn làm mới khi có kết nối.')}<br /><small>{walletError}</small></p>}{!commerceAvailable && !wallet ? <p className="commerce-muted">{tr('Order tracking is currently unavailable. Reference prices and voluntary donations remain visible.', 'Hiện chưa thể theo dõi đơn. Bạn vẫn có thể xem giá tham khảo và ủng hộ tùy tâm.')}</p> : wallet ? <>{isCredits && <p className="commerce-credit-balance"><strong>{wallet.wallet.credits}</strong>{tr('AI reply credits available', 'lượt trả lời AI có thể dùng')}</p>}<p className="commerce-muted">{tr('Orders belong to this browser. Keep site data to retain access. An optional contact email does not sign you in or recover this wallet.', 'Đơn được lưu theo trình duyệt này. Hãy giữ dữ liệu trang để tiếp tục truy cập. Email liên hệ không dùng để đăng nhập hoặc khôi phục ví này.')}</p>{wallet.orders.length ? <ul className="commerce-order-list">{wallet.orders.map(item => <li key={item.id}><div><strong>{item.kind === 'donation' ? tr('Support for Eva', 'Ủng hộ Eva') : vi ? item.product_snapshot?.title_vi || item.product_snapshot?.title_en || item.product_title_vi || item.product_title_en || item.product_title || tr('Reading', 'Trải bài') : item.product_snapshot?.title_en || item.product_title_en || item.product_title || tr('Reading', 'Trải bài')}</strong><span className={`commerce-status commerce-status-${item.status}`}>{status(item)}</span><small>{formatDate(new Date(item.created_at), { dateStyle: 'medium' })} · {orderReference(item)}</small></div><div><strong>{formatVnd(item.amount_vnd, vi)}</strong><button className="commerce-link" onClick={() => resumeOrder(item)}>{tr('View details', 'Xem chi tiết')}<ArrowRight size={15} /></button></div></li>)}</ul> : <p className="commerce-empty">{tr('No orders yet. Your payment updates will appear here.', 'Bạn chưa có đơn nào. Cập nhật thanh toán sẽ xuất hiện tại đây.')}</p>}</> : !walletError && <p className="commerce-muted" role="status">{tr('Loading your orders…', 'Đang tải đơn của bạn…')}</p>}</section>
      <footer className="commerce-footer"><p>{tr('Tarot offers a way to reflect. It cannot guarantee outcomes or tell you what someone else is thinking.', 'Tarot giúp bạn nhìn lại câu chuyện của mình, không bảo đảm kết quả hay đọc được suy nghĩ của người khác.')}</p>{settings?.support_email && <a href={`mailto:${settings.support_email}`}>{tr('Questions about a payment?', 'Bạn cần hỗ trợ thanh toán?')}</a>}</footer>
    </main>
    {showCheckout && <Modal title={order ? tr('Payment details', 'Chi tiết thanh toán') : donate ? tr('Support Eva', 'Ủng hộ Eva') : tr('Your reading package', 'Gói trải bài của bạn')} onClose={closeCheckout} className="commerce-modal">
      {order ? <><span className="commerce-eyebrow">{tr('Your order', 'Đơn của bạn')} · {order.id.slice(0, 8)}</span><h2>{order.status === 'confirmed' ? tr('Thank you.', 'Cảm ơn bạn.') : tr('One simple transfer.', 'Chuyển khoản đơn giản.')}</h2><p className={`commerce-status commerce-status-${order.status}`} role="status">{status(order)}</p>{order.status === 'confirmed' ? <div className="commerce-paid"><CheckCircle2 size={44} /><p>{order.kind === 'donation' ? tr('Your contribution has been verified. Thank you for supporting Eva.', 'Khoản ủng hộ đã được xác nhận. Cảm ơn bạn đã đồng hành cùng Eva.') : order.kind === 'credits' ? tr('Your AI reply credits have been added to this device’s wallet.', 'Lượt trả lời AI đã được cộng vào ví của thiết bị này.') : tr('Your payment has been verified. Contact Eva with the reference below to arrange your reading.', 'Thanh toán đã được xác nhận. Bạn liên hệ Eva kèm mã bên dưới để sắp xếp buổi trải bài.')}<br /><strong>{orderReference(order)}</strong></p><button className="commerce-button" onClick={onStart}>{tr('Continue to Eva', 'Tiếp tục với Eva')}<ArrowRight size={17} /></button></div> : order.status === 'rejected' ? <p className="commerce-notice">{tr('This payment was not approved. Contact Eva with your order reference if you need help.', 'Thanh toán này chưa được duyệt. Bạn liên hệ Eva kèm mã đơn nếu cần hỗ trợ.')}{(order.payment_note || order.note) && <><br />{order.payment_note || order.note}</>}</p> : !commerceAvailable ? <p className="commerce-notice">{tr('Current transfer details are unavailable. Check again before sending a payment.', 'Chưa tải được thông tin chuyển khoản hiện tại. Bạn vui lòng kiểm tra lại trước khi chuyển tiền.')}<button className="commerce-button commerce-button-quiet" onClick={() => void loadCatalog()}>{tr('Check again', 'Kiểm tra lại')}</button></p> : <>
        <PaymentQR payload={paymentPayload(order, settings)} label={tr('Scan this bank transfer QR. If the QR is unavailable, use the bank details below.', 'Quét mã QR để chuyển khoản. Nếu mã chưa hiển thị, dùng thông tin ngân hàng bên dưới.')} />
        <BankDetails settings={settings ?? {}} order={order} vi={vi} />
        <p className="commerce-notice">{tr('Your bank may display the account holder’s legal name. Verify the bank, account number, amount, and transfer reference before sending. Tapping the button below reports a transfer; it does not confirm payment.', 'Ứng dụng ngân hàng có thể hiển thị tên pháp lý của chủ tài khoản. Kiểm tra ngân hàng, số tài khoản, số tiền và nội dung chuyển khoản trước khi gửi. Nút bên dưới chỉ báo đã chuyển, không xác nhận thanh toán.')}</p>
        <button className="commerce-button commerce-button-full" onClick={() => void transferSent()} disabled={busy || order.status === 'transfer_sent'}>{busy ? <LoaderCircle className="commerce-spin" size={18} /> : <Check size={18} />}{order.status === 'transfer_sent' ? tr('Transfer reported — waiting for verification', 'Đã báo chuyển — đang chờ xác nhận') : tr('I’ve sent the transfer', 'Tôi đã chuyển khoản')}</button><button className="commerce-link commerce-centered" disabled={refreshing} onClick={() => void refreshWallet()}><RefreshCw size={16} />{tr('Check payment status', 'Kiểm tra thanh toán')}</button>{(paymentUpdateNotice || lastPaymentCheck) && <p className="commerce-muted">{paymentUpdateNotice}{lastPaymentCheck && <>{paymentUpdateNotice && <br />}{tr('Last checked', 'Kiểm tra gần nhất')}: {lastPaymentCheck}</>}</p>}
      </>}{settings?.support_email && <a className="commerce-link commerce-centered" href={`mailto:${settings.support_email}?subject=${encodeURIComponent(`Eva Tarot ${orderReference(order)}`)}`}>{tr('Contact Eva about this order', 'Liên hệ Eva về đơn này')}</a>}</> : <form onSubmit={event => void createOrder(event)}>
        <span className="commerce-eyebrow">{donate ? tr('A voluntary contribution', 'Khoản ủng hộ tùy tâm') : tr('Selected for you', 'Gói bạn đã chọn')}</span><h2>{donate ? tr('A little thank-you.', 'Gửi một chút yêu thương.') : product ? title(product) : ''}</h2>{product && <p className="commerce-checkout-price">{formatVnd(product.price_vnd, vi)}</p>}{donate && <><label className="commerce-field"><span>{tr('Amount (VND)', 'Số tiền (VNĐ)')}</span><input type="number" inputMode="numeric" min="1000" max="10000000" step="1000" required value={amount} onChange={event => { setAmount(event.target.value); intent.current = crypto.randomUUID(); }} /></label><div className="commerce-amounts">{(settings?.donation_suggested_vnd ?? [25000, 50000, 100000]).map(value => <button key={value} type="button" aria-pressed={Number(amount) === value} onClick={() => { setAmount(String(value)); intent.current = crypto.randomUUID(); }}>{formatVnd(value, vi)}</button>)}</div><p>{tr('Donations do not add AI reply credits.', 'Ủng hộ không cộng lượt trả lời AI.')}</p></>}
        <label className="commerce-field"><span>{tr('Contact email (optional)', 'Email liên hệ (không bắt buộc)')}</span><input type="email" autoComplete="email" maxLength={254} value={email} placeholder="you@example.com" onChange={event => { setEmail(event.target.value); intent.current = crypto.randomUUID(); }} /><small>{tr('For payment support only. This does not create an account.', 'Chỉ dùng để hỗ trợ thanh toán, không tạo tài khoản.')}</small></label><p className="commerce-muted">{tr('Next, you’ll see the bank details and a unique reference. Payment is reviewed manually.', 'Tiếp theo là thông tin ngân hàng và mã chuyển khoản riêng. Thanh toán sẽ được kiểm tra thủ công.')}</p><button className="commerce-button commerce-button-full" disabled={busy} type="submit">{busy ? <LoaderCircle className="commerce-spin" size={18} /> : <ArrowRight size={18} />}{tr('Show transfer details', 'Xem thông tin chuyển khoản')}</button>
      </form>}{error && <p className="commerce-notice commerce-error" role="alert">{error}</p>}<button className="commerce-link commerce-centered" disabled={busy} onClick={closeCheckout}><X size={15} />{tr('Close', 'Đóng')}</button>
    </Modal>}
  </div>;
}
function BankDetails({ settings, order, vi }: { settings: CommerceSettings; order?: CommerceOrder; vi: boolean }) {
  const entries = [
    { label: vi ? 'Ngân hàng' : 'Bank', value: settings.bank_name || '' },
    { label: vi ? 'Số tài khoản' : 'Account number', value: settings.account_number || '' },
    ...(order ? [{ label: vi ? 'Số tiền' : 'Amount', value: formatVnd(order.amount_vnd, vi), copy: String(order.amount_vnd) }, { label: vi ? 'Nội dung chuyển khoản' : 'Transfer reference', value: orderReference(order) }] : []),
  ];
  return <dl className="commerce-bank">{entries.filter(item => item.value).map(item => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><CopyButton value={item.copy || item.value} label={`${vi ? 'Sao chép' : 'Copy'} ${item.label.toLowerCase()}`} copiedLabel={vi ? 'Đã sao chép' : 'Copied'} /></dd></div>)}</dl>;
}

function paymentPayload(order: CommerceOrder, settings?: CommerceSettings): string | undefined {
  if (!settings?.bank_bin || !settings.account_number) return undefined;
  try { return buildVietQR({ bankBin: settings.bank_bin, accountNumber: settings.account_number, amountVnd: order.amount_vnd, reference: orderReference(order) }); }
  catch { return undefined; } // The displayed bank details remain usable if a saved QR configuration is invalid.
}

function DirectDonation({ vi }: { vi: boolean }) {
  return <div>
    <PaymentQR fallback="/payments/donation-qr.svg" label={vi ? 'Mã chuyển khoản VietQR của Eva: Techcombank, tài khoản 6886439999.' : 'Eva’s bank-transfer VietQR: Techcombank, account 6886439999.'} />
    <BankDetails settings={PUBLIC_DONATION_DETAILS} vi={vi} />
    <p className="commerce-notice">{vi ? 'Bạn có thể quét mã trong ứng dụng ngân hàng và nhập số tiền tùy tâm. Ngân hàng có thể hiển thị tên pháp lý của chủ tài khoản. Kiểm tra đúng ngân hàng và số tài khoản trước khi gửi. Hiện chưa có theo dõi thanh toán hoặc biên nhận trong Eva; khoản ủng hộ không cộng lượt AI. Giữ biên nhận của ngân hàng nếu cần.' : 'Scan in your banking app and choose your own amount. Your bank may display the account holder’s legal name. Verify the bank and account number before sending. Payment tracking and Eva receipts are unavailable; donations do not add AI credits. Keep your bank’s transfer receipt.'}</p>
  </div>;
}
