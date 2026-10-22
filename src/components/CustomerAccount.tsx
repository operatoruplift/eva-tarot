import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../lib/i18n';
import { CUSTOMER_AUTH_STORAGE_KEY, CUSTOMER_CODE_RESEND_SECONDS, CustomerAccountError, customerAuth } from '../lib/customer-auth';
import { CONNECTION_EVENT, CONNECTION_KEY, readConnection } from '../lib/account-connection';
import type { CustomerAccountCapabilities, CustomerAccountStatus, CustomerAccountUser, CustomerIdentity } from '../lib/customer-auth';
import './customer-account.css';

export type CustomerAccountProps = {
  beforeSwitch: (signal?: AbortSignal) => Promise<void>;
  onLink: (user: CustomerAccountUser, accessToken: string, signal?: AbortSignal) => Promise<void>;
  onRestore: (user: CustomerAccountUser, capabilities: CustomerAccountCapabilities, signal?: AbortSignal) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onSignOutError?: (message: string) => void;
  connectedEmail?: string;
};
type AccountOperation = { epoch: number; connection: string | null; controller: AbortController; committing: boolean };
class StaleAccountOperation extends Error {}

export function CustomerAccount({ beforeSwitch, onLink, onRestore, onDisconnect, onSignOutError, connectedEmail }: CustomerAccountProps) {
  const { language, t } = useLanguage();
  const copy = (en: string, vi: string) => language === 'vi' ? vi : t(en);
  const [identity, setIdentity] = useState<CustomerIdentity | null>(null);
  const [status, setStatus] = useState<CustomerAccountStatus | null>(null);
  const [email, setEmail] = useState(''); const [sentEmail, setSentEmail] = useState(''); const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(customerAuth.available);
  const [checking, setChecking] = useState(customerAuth.available);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0); const [now, setNow] = useState(Date.now());
  const mounted = useRef(true); const running = useRef<number | null>(null); const operationEpoch = useRef(0);
  const activeOperation = useRef<AccountOperation | null>(null);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));

  function failure(cause: unknown) {
    if (!(cause instanceof CustomerAccountError)) return cause instanceof Error ? t(cause.message) : copy('That did not finish. Your current device data is unchanged. Please try again.', 'Thao tác chưa hoàn tất. Dữ liệu hiện tại trên thiết bị vẫn được giữ nguyên. Hãy thử lại.');
    const messages: Record<CustomerAccountError['code'], [string, string]> = {
      disabled: ['Account recovery is being prepared. Your readings stay on this browser.', 'Khôi phục tài khoản đang được chuẩn bị. Các bài đọc vẫn được giữ trong trình duyệt này.'],
      email: ['Enter a valid email address.', 'Hãy nhập địa chỉ email hợp lệ.'],
      code: ['Enter the 6–8 digit code from your latest email.', 'Nhập mã gồm 6–8 chữ số trong email mới nhất.'],
      expired: ['That code has expired. Request a new code and use the latest email.', 'Mã đã hết hạn. Hãy yêu cầu mã mới và dùng email mới nhất.'],
      rate_limit: ['Please wait a little before trying again.', 'Vui lòng đợi một chút rồi thử lại.'],
      auth: ['We could not verify your account. Check the latest code or try signing in again.', 'Chưa thể xác minh tài khoản. Kiểm tra mã mới nhất hoặc thử đăng nhập lại.'],
      changed: ['Your signed-in account changed. Review the email shown here and choose again.', 'Tài khoản đăng nhập đã thay đổi. Kiểm tra email hiển thị tại đây rồi chọn lại.'],
      signout: ['We could not finish signing out. Keep this screen open and try again.', 'Chưa thể hoàn tất đăng xuất. Giữ màn hình này mở và thử lại.'],
      network: ['We could not reach account recovery. Check your connection and try again.', 'Không thể kết nối dịch vụ khôi phục. Kiểm tra mạng rồi thử lại.'],
      response: ['The account response could not be verified. Your current device data is unchanged.', 'Chưa thể xác nhận phản hồi tài khoản. Dữ liệu hiện tại trên thiết bị vẫn được giữ nguyên.'],
      conflict: ['This device or account is already connected. Restore your saved account instead of replacing it.', 'Thiết bị hoặc tài khoản này đã có kết nối. Hãy khôi phục tài khoản đã lưu thay vì thay thế.'],
      unavailable: ['Account recovery is unavailable right now. Your current device data is unchanged.', 'Dịch vụ khôi phục hiện chưa sẵn sàng. Dữ liệu hiện tại trên thiết bị vẫn được giữ nguyên.'],
    };
    return copy(...messages[cause.code]);
  }
  function connectionVersion() {
    try { return localStorage.getItem(CONNECTION_KEY); }
    catch { throw new CustomerAccountError('response', 'The current device connection could not be checked.'); }
  }
  function assertCurrent(operation: AccountOperation, checkConnection = true) {
    if (!mounted.current || operation.controller.signal.aborted || operationEpoch.current !== operation.epoch) throw new StaleAccountOperation();
    if (checkConnection && connectionVersion() !== operation.connection) throw new CustomerAccountError('changed', 'The current device connection changed.');
  }
  async function matchingIdentity(operation: AccountOperation, expectedId: string) {
    const fresh = await customerAuth.currentIdentity(); assertCurrent(operation);
    if (!fresh || fresh.user.id !== expectedId) throw new CustomerAccountError('changed', 'Your signed-in account changed. Review the email shown here and choose again.');
    return fresh;
  }
  async function freshAccount(operation: AccountOperation) {
    const fresh = await customerAuth.currentIdentity();
    assertCurrent(operation);
    if (!fresh) throw new CustomerAccountError('auth', 'Sign in again to continue.');
    const nextStatus = await customerAuth.status(fresh.accessToken);
    assertCurrent(operation);
    if (nextStatus.email !== fresh.user.email) throw new CustomerAccountError('response', 'The account response could not be verified.');
    if ((identity && fresh.user.id !== identity.user.id) || (connectedEmail && fresh.user.email !== connectedEmail)) {
      if (mounted.current) { setIdentity(fresh); setStatus(nextStatus); setConsent(false); }
      throw new CustomerAccountError('changed', 'Your signed-in account changed. Review the email shown here and choose again.');
    }
    return { fresh, nextStatus };
  }
  useEffect(() => {
    mounted.current = true;
    const invalidate = (event: Event) => {
      if (event.type === 'storage' && ![null, CONNECTION_KEY, CUSTOMER_AUTH_STORAGE_KEY].includes((event as StorageEvent).key)) return;
      // A mutating parent callback stages its own connection before activation.
      // Cross-tab storage events still cancel that operation; parent callbacks
      // also validate their own expected connection before committing.
      if (event.type === CONNECTION_EVENT && activeOperation.current?.committing) return;
      operationEpoch.current++; activeOperation.current?.controller.abort();
      if (mounted.current) { setConsent(false); setError(failure(new CustomerAccountError('changed', 'The current device connection changed.'))); }
    };
    const release = () => { mounted.current = false; operationEpoch.current++; activeOperation.current?.controller.abort(); window.removeEventListener('storage', invalidate); window.removeEventListener(CONNECTION_EVENT, invalidate); };
    if (!customerAuth.available) return release;
    window.addEventListener('storage', invalidate); window.addEventListener(CONNECTION_EVENT, invalidate);
    let current = true;
    void customerAuth.currentIdentity().then(async fresh => {
      if (!fresh) return;
      const nextStatus = await customerAuth.status(fresh.accessToken);
      if (nextStatus.email !== fresh.user.email) throw new CustomerAccountError('response', 'The account response could not be verified.');
      if (current) { setIdentity(fresh); setStatus(nextStatus); }
    }).catch(cause => { if (current) setError(failure(cause)); }).finally(() => { if (current) { setBusy(false); setChecking(false); } });
    return () => { current = false; release(); };
    // Signing in only checks status. Saving/restoring is always a separate click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!resendAt) return;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, [resendAt]);

  async function perform(action: (operation: AccountOperation) => Promise<void>) {
    if (!mounted.current || running.current !== null) return;
    let operation: AccountOperation;
    try { operation = { epoch: ++operationEpoch.current, connection: connectionVersion(), controller: new AbortController(), committing: false }; }
    catch (cause) { setError(failure(cause)); return; }
    running.current = operation.epoch; activeOperation.current = operation; setBusy(true); setError(''); setNotice('');
    try { await action(operation); }
    catch (cause) { if (!(cause instanceof StaleAccountOperation) && mounted.current && operationEpoch.current === operation.epoch) setError(failure(cause)); }
    finally { if (running.current === operation.epoch) { running.current = null; activeOperation.current = null; if (mounted.current) setBusy(false); } }
  }
  async function sendCode() {
    if (remaining > 0) return;
    await perform(async operation => {
      const sent = await customerAuth.sendCode(sentEmail || email);
      assertCurrent(operation);
      setSentEmail(sent); setCode(''); setNow(Date.now()); setResendAt(Date.now() + CUSTOMER_CODE_RESEND_SECONDS * 1000);
      setNotice(copy('Code requested. Check your inbox and spam folder; delivery can take a moment.', 'Đã yêu cầu mã. Kiểm tra hộp thư đến và thư rác; email có thể đến sau một chút.'));
    });
  }
  async function verifyCode() {
    await perform(async operation => {
      const verified = await customerAuth.verifyCode(sentEmail, code);
      assertCurrent(operation);
      const nextStatus = await customerAuth.status(verified.accessToken);
      assertCurrent(operation);
      if (nextStatus.email !== verified.user.email) throw new CustomerAccountError('response', 'The account response could not be verified.');
      if (!mounted.current) return;
      setIdentity(verified); setStatus(nextStatus); setCode(''); setSentEmail(''); setConsent(false);
      setNotice(copy('Email verified. Choose below whether to save this device or restore your account.', 'Email đã được xác minh. Chọn bên dưới để lưu thiết bị này hoặc khôi phục tài khoản.'));
    });
  }
  async function link() {
    if (!consent || (connectedEmail && connectedEmail !== identity?.user.email)) return;
    await perform(async operation => {
      await beforeSwitch(operation.controller.signal); assertCurrent(operation);
      const { fresh, nextStatus } = await freshAccount(operation);
      if (nextStatus.linked) { if (mounted.current) { setIdentity(fresh); setStatus(nextStatus); setConsent(false); } throw new CustomerAccountError('conflict', 'This account already has saved data.'); }
      await matchingIdentity(operation, fresh.user.id); assertCurrent(operation);
      operation.committing = true;
      await onLink(fresh.user, fresh.accessToken, operation.controller.signal);
      assertCurrent(operation, false);
      const confirmed = await customerAuth.status(fresh.accessToken);
      assertCurrent(operation, false);
      if (!confirmed.linked || confirmed.email !== fresh.user.email) throw new CustomerAccountError('response', 'The account connection was not confirmed.');
      if (mounted.current) { setIdentity(fresh); setStatus(confirmed); setConsent(false); setNotice(copy('This device is connected to your verified account.', 'Thiết bị này đã kết nối với tài khoản đã xác minh.')); }
    });
  }
  async function restore() {
    if (connectedEmail && connectedEmail !== identity?.user.email) return;
    await perform(async operation => {
      await beforeSwitch(operation.controller.signal); assertCurrent(operation);
      const { fresh, nextStatus } = await freshAccount(operation);
      if (!nextStatus.linked) { if (mounted.current) { setIdentity(fresh); setStatus(nextStatus); } throw new CustomerAccountError('unavailable', 'This account has no saved connection yet.'); }
      const restored = await customerAuth.restore(fresh.accessToken);
      assertCurrent(operation);
      if (!restored || restored.email !== fresh.user.email) throw new CustomerAccountError('response', 'The saved account could not be verified.');
      await matchingIdentity(operation, fresh.user.id); assertCurrent(operation);
      operation.committing = true;
      await onRestore(fresh.user, { commerceToken: restored.commerceToken, backupToken: restored.backupToken }, operation.controller.signal);
      assertCurrent(operation, false);
      if (mounted.current) { setIdentity(fresh); setStatus(nextStatus); setNotice(copy('Your saved account is connected. Your device-only journal stays separate.', 'Đã kết nối tài khoản đã lưu. Nhật ký chỉ có trên thiết bị vẫn được giữ riêng.')); }
    });
  }
  async function disconnect() {
    await perform(async operation => {
      const expectedUserId = identity?.user.id ?? readConnection()?.account?.userId;
      await beforeSwitch(operation.controller.signal); assertCurrent(operation);
      operation.committing = true;
      await onDisconnect();
      // Disconnect intentionally remounts the reader. Finish signing out only
      // the identity that began this action, even after that expected unmount.
      try { await customerAuth.signOut(expectedUserId); }
      catch (cause) {
        const signOutFailure = cause instanceof CustomerAccountError ? cause : new CustomerAccountError('signout', 'We could not finish signing out. Keep this screen open and try again.');
        // The stable parent notice survives the intentional account-scope
        // remount; an unmounted panel cannot report this failure itself.
        onSignOutError?.(copy('This device is disconnected, but sign-out did not finish. ', 'Thiết bị đã ngắt kết nối, nhưng đăng xuất chưa hoàn tất. ') + failure(signOutFailure));
        throw signOutFailure;
      }
      if (mounted.current) { setIdentity(null); setStatus(null); setConsent(false); setSentEmail(''); setCode(''); setNotice(copy('Signed out on this device. Your account remains available with your email.', 'Đã đăng xuất trên thiết bị này. Bạn vẫn có thể truy cập tài khoản bằng email.')); }
    });
  }

  return <section className="customer-account" aria-label={copy('Your Eva account', 'Tài khoản Eva của bạn')} aria-busy={busy}>
    <div className="customer-account-heading"><span className="customer-account-icon"><ShieldCheck size={22}/></span><div><h3>{copy('Your Eva account', 'Tài khoản Eva của bạn')}</h3><p>{copy('A familiar place, on your next device too.', 'Góc nhỏ quen thuộc, trên cả thiết bị mới.')}</p></div></div>
    {!customerAuth.available ? <div className="customer-account-pending"><p>{copy('Email account recovery is being prepared.', 'Khôi phục tài khoản bằng email đang được chuẩn bị.')}</p><p>{copy('For now, keep this browser’s site data and export your journal before switching devices. Nothing is uploaded by this panel.', 'Hiện tại, hãy giữ dữ liệu trang trong trình duyệt và xuất nhật ký trước khi đổi thiết bị. Bảng này chưa tải dữ liệu lên.')}</p></div> : <>
      {checking ? <p className="customer-account-progress"><LoaderCircle size={16}/>{copy('Checking your account…', 'Đang kiểm tra tài khoản…')}</p> : null}
      {!identity && !checking && connectedEmail ? <div><p>{copy('This device is connected to', 'Thiết bị này đang kết nối với')} <strong className="customer-account-email">{connectedEmail}</strong></p><button className="customer-account-signout" disabled={busy} onClick={() => void disconnect()}>{copy('Sign out on this device', 'Đăng xuất trên thiết bị này')}</button></div> : null}
      {!identity && !checking && !sentEmail ? <form className="customer-account-form" onSubmit={event => { event.preventDefault(); void sendCode(); }}>
        <p>{copy('Use a code sent to your email. Signing in alone does not upload or replace your journal.', 'Dùng mã gửi đến email. Chỉ đăng nhập sẽ chưa tải lên hoặc thay thế nhật ký của bạn.')}</p>
        <label htmlFor="eva-customer-email">Email</label><input id="eva-customer-email" type="email" autoComplete="email" inputMode="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required disabled={busy}/>
        <button type="submit" className="customer-account-primary" disabled={busy || remaining > 0}>{busy ? <LoaderCircle className="customer-account-spin" size={17}/> : <Mail size={17}/>} {busy ? copy('Requesting your code…', 'Đang yêu cầu mã…') : remaining > 0 ? copy(`Try again in ${remaining}s`, `Thử lại sau ${remaining} giây`) : copy('Send my sign-in code', 'Gửi mã đăng nhập')}</button>
      </form> : null}
      {!identity && sentEmail ? <form className="customer-account-form" onSubmit={event => { event.preventDefault(); void verifyCode(); }}>
        <p>{copy('Enter the latest code sent to', 'Nhập mã mới nhất đã gửi đến')} <strong className="customer-account-email">{sentEmail}</strong></p>
        <label htmlFor="eva-customer-code">{copy('Email code', 'Mã trong email')}</label><input id="eva-customer-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required disabled={busy}/>
        <button type="submit" className="customer-account-primary" disabled={busy || !/^\d{6,8}$/.test(code)}>{busy ? <LoaderCircle className="customer-account-spin" size={17}/> : <KeyRound size={17}/>} {copy('Verify my email', 'Xác minh email')}</button>
        <div className="customer-account-actions"><button type="button" disabled={busy || remaining > 0} onClick={() => void sendCode()}>{remaining > 0 ? copy(`Resend in ${remaining}s`, `Gửi lại sau ${remaining} giây`) : copy('Request a new code', 'Yêu cầu mã mới')}</button><button type="button" disabled={busy} onClick={() => { setSentEmail(''); setCode(''); setError(''); setNotice(''); }}><ChevronLeft size={14}/>{copy('Change email', 'Đổi email')}</button></div>
        <p className="customer-account-note">{copy('Codes expire. If yours no longer works, request a new one and use the latest email.', 'Mã có thời hạn. Nếu mã không còn dùng được, hãy yêu cầu mã mới và mở email mới nhất.')}</p>
      </form> : null}
      {identity ? <div className="customer-account-verified"><p className="customer-account-verified-email"><Check size={16}/><span>{copy('Verified email', 'Email đã xác minh')}<strong>{identity.user.email}</strong></span></p>
        {connectedEmail && connectedEmail !== identity.user.email ? <p>{copy('This device is still connected to a different Eva account. Sign out on this device first, then verify the email you want to use. Each account’s data stays separate.', 'Thiết bị này vẫn đang kết nối với một tài khoản Eva khác. Hãy đăng xuất trên thiết bị này trước, rồi xác minh email muốn dùng. Dữ liệu của từng tài khoản được giữ riêng.')}</p> : connectedEmail === identity.user.email ? <><p>{copy('This device is using your saved account. Credits and private backup belong to this account.', 'Thiết bị này đang dùng tài khoản đã lưu. Lượt trả lời và bản sao lưu riêng tư thuộc tài khoản này.')}</p><p className="customer-account-note">{copy('Only successfully synced readings, profile and calendar can be restored. Check your private backup status; its current limit is 1 MB. Signing out here does not sign out your other devices.', 'Chỉ các bài đọc, hồ sơ và lịch đã đồng bộ thành công mới khôi phục được. Kiểm tra trạng thái bản sao lưu riêng tư; giới hạn hiện tại là 1 MB. Đăng xuất tại đây không đăng xuất các thiết bị khác.')}</p></> : status?.linked ? <>
          <p>{copy('This email already has a saved account. Restore its existing credits and successfully synced private journal.', 'Email này đã có tài khoản được lưu. Khôi phục số lượt trả lời và nhật ký riêng tư đã đồng bộ thành công.')}</p>
          <p className="customer-account-note">{copy('Your current device-only data stays separate. Balances are not added together.', 'Dữ liệu chỉ có trên thiết bị hiện tại được giữ riêng. Số lượt trả lời không cộng gộp.')}</p>
          <button className="customer-account-primary" disabled={busy} onClick={() => void restore()}>{busy ? <LoaderCircle className="customer-account-spin" size={17}/> : <KeyRound size={17}/>} {copy('Restore my saved account', 'Khôi phục tài khoản đã lưu')}</button>
        </> : <>
          <p>{copy('Connect this device to your email to recover the same credits and successfully synced journal on another device. This does not create extra trial credits.', 'Kết nối thiết bị với email để khôi phục cùng số lượt trả lời và nhật ký đã đồng bộ trên thiết bị khác. Thao tác này không tạo thêm lượt dùng thử.')}</p>
          <label className="customer-account-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/><span>{copy('I agree to save my readings, profile and calendar in private cloud backup, and connect this device’s credits to my verified account.', 'Tôi đồng ý lưu các bài đọc, hồ sơ và lịch trong bản sao lưu đám mây riêng tư, đồng thời kết nối lượt trả lời của thiết bị với tài khoản đã xác minh.')}</span></label>
          <button className="customer-account-primary" disabled={busy || !consent} onClick={() => void link()}>{busy ? <LoaderCircle className="customer-account-spin" size={17}/> : <ShieldCheck size={17}/>} {copy('Save this device to my account', 'Lưu thiết bị vào tài khoản')}</button>
          <p className="customer-account-note">{copy('Private backup currently holds up to 1 MB. Keep an exported copy until backup shows your latest changes are synced.', 'Bản sao lưu riêng tư hiện lưu tối đa 1 MB. Giữ một bản xuất cho đến khi bản sao lưu báo đã đồng bộ các thay đổi mới nhất.')}</p>
        </>}
        <button className="customer-account-signout" disabled={busy} onClick={() => void disconnect()}>{copy('Sign out on this device', 'Đăng xuất trên thiết bị này')}</button>
      </div> : null}
    </>}
    {error ? <p className="customer-account-error" role="alert">{error}</p> : null}
    {notice ? <p className="customer-account-notice" role="status">{notice}</p> : null}
  </section>;
}
