import { createClient } from '@supabase/supabase-js';

export type CustomerAccountUser = { id: string; email: string };
export type CustomerAccountCapabilities = { commerceToken: string; backupToken: string };
export type CustomerAccountStatus = { linked: boolean; email: string; updatedAt: string | null };
export type CustomerIdentity = { user: CustomerAccountUser; accessToken: string };
type AuthFailure = { message: string; code?: string } | null;
type AuthUser = { id: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
type AuthSession = { access_token: string; user: { id: string } };
type CustomerAuthGateway = {
  signInWithOtp: (input: { email: string; options: { shouldCreateUser: boolean } }) => Promise<{ error: AuthFailure }>;
  verifyOtp: (input: { email: string; token: string; type: 'email' }) => Promise<{ error: AuthFailure }>;
  getUser: (jwt?: string) => Promise<{ data: { user: AuthUser | null }; error: AuthFailure }>;
  getSession: () => Promise<{ data: { session: AuthSession | null }; error: AuthFailure }>;
  signOut: (input: { scope: 'local' }) => Promise<{ error: AuthFailure }>;
};
type Config = { enabled: boolean; url?: string; publishableKey?: string };
type Dependencies = { auth?: CustomerAuthGateway; fetcher?: typeof fetch; timeoutMs?: number };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CAPABILITY = /^[a-f0-9]{64}$/;
const SESSION_TOKEN = /^[A-Za-z0-9_.-]{20,8192}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CUSTOMER_AUTH_STORAGE_KEY = 'eva-customer-auth-v1';
export const CUSTOMER_CODE_RESEND_SECONDS = 60;

export class CustomerAccountError extends Error {
  code: 'disabled' | 'email' | 'code' | 'expired' | 'rate_limit' | 'auth' | 'changed' | 'signout' | 'network' | 'response' | 'conflict' | 'unavailable';
  constructor(code: CustomerAccountError['code'], message: string) { super(message); this.code = code; }
}
export function customerEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}
export function validCustomerCapabilities(value: unknown): value is CustomerAccountCapabilities {
  if (!value || typeof value !== 'object') return false;
  const record = value as CustomerAccountCapabilities;
  return Object.keys(record).sort().join(',') === 'backupToken,commerceToken' && CAPABILITY.test(record.commerceToken) && CAPABILITY.test(record.backupToken);
}
function authFailure(error: AuthFailure): CustomerAccountError {
  if (error?.code === 'otp_expired') return new CustomerAccountError('expired', 'That code has expired. Request a new code and use the latest email.');
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code ?? '')) return new CustomerAccountError('rate_limit', 'Please wait a little before requesting another code.');
  return new CustomerAccountError('auth', 'We could not verify your account. Check the latest code or try signing in again.');
}
function validStatus(value: unknown): value is CustomerAccountStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as CustomerAccountStatus;
  return typeof status.linked === 'boolean' && typeof status.email === 'string' && customerEmail(status.email) === status.email
    && (status.updatedAt === null || (typeof status.updatedAt === 'string' && Number.isFinite(Date.parse(status.updatedAt))))
    && (status.linked ? status.updatedAt !== null : status.updatedAt === null);
}

export function createCustomerAuth(config: Config, dependencies: Dependencies = {}) {
  const configured = Boolean(config.enabled && config.url && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url) && config.publishableKey);
  // This namespace is deliberately separate from the owner dashboard's session.
  const auth = configured ? dependencies.auth ?? createClient(config.url!, config.publishableKey!, {
    auth: { storageKey: CUSTOMER_AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  }).auth : null;
  const fetcher = dependencies.fetcher ?? fetch;
  function requireAuth(): CustomerAuthGateway {
    if (!auth) throw new CustomerAccountError('disabled', 'Account recovery is being prepared. Your readings stay on this browser.');
    return auth;
  }
  async function authRequest<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CustomerAccountError('network', 'Account sign-in took too long. Check your connection and try again.')), dependencies.timeoutMs ?? 15_000);
      })]);
    } catch (cause) {
      if (cause instanceof CustomerAccountError) throw cause;
      throw new CustomerAccountError('network', 'We could not reach account sign-in. Check your connection and try again.');
    } finally { clearTimeout(timer); }
  }
  async function currentIdentity(): Promise<CustomerIdentity | null> {
    const gateway = requireAuth();
    const sessionResult = await authRequest(() => gateway.getSession());
    if (sessionResult.error) throw authFailure(sessionResult.error);
    const session = sessionResult.data.session;
    if (!session) return null;
    if (!SESSION_TOKEN.test(session.access_token)) throw authFailure(null);
    // Local session data only supplies the bearer; Auth verifies the identity.
    const verified = await authRequest(() => gateway.getUser(session.access_token));
    const user = verified.data.user;
    if (verified.error || !user || !UUID.test(user.id) || user.id !== session.user?.id || !user.email_confirmed_at || user.is_anonymous !== false || !user.email) throw authFailure(verified.error);
    const email = customerEmail(user.email);
    if (!email) throw authFailure(null);
    return { user: { id: user.id, email }, accessToken: session.access_token };
  }
  async function request(accessToken: string, body: { action: 'status' | 'link' | 'restore'; commerceToken?: string; backupToken?: string }): Promise<unknown> {
    requireAuth();
    if (!SESSION_TOKEN.test(accessToken)) throw authFailure(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 15_000);
    try {
      const response = await fetcher(`${config.url!.replace(/\/$/, '')}/functions/v1/customer-account`, {
        method: 'POST', signal: controller.signal, credentials: 'omit', cache: 'no-store',
        headers: { apikey: config.publishableKey!, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw authFailure(null);
        if (response.status === 409) throw new CustomerAccountError('conflict', 'This device or account is already connected. Restore your saved account instead of replacing it.');
        if (response.status === 429) throw new CustomerAccountError('rate_limit', 'Please wait a little and try again.');
        throw new CustomerAccountError('unavailable', 'Account recovery is unavailable right now. Your current device data is unchanged.');
      }
      const text = await response.text();
      if (text.length > 16_384) throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.');
      let result: unknown;
      try { result = JSON.parse(text); } catch { throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.'); }
      return result;
    } catch (cause) {
      if (cause instanceof CustomerAccountError) throw cause;
      throw new CustomerAccountError('network', 'We could not reach account recovery. Check your connection and try again.');
    } finally { clearTimeout(timeout); }
  }
  function checkedStatus(value: unknown): CustomerAccountStatus {
    if (!validStatus(value)) throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.');
    return { linked: value.linked, email: value.email, updatedAt: value.updatedAt };
  }
  return {
    available: configured,
    currentIdentity,
    async sendCode(value: string) {
      const gateway = requireAuth(); const email = customerEmail(value);
      if (!email) throw new CustomerAccountError('email', 'Enter a valid email address.');
      const { error } = await authRequest(() => gateway.signInWithOtp({ email, options: { shouldCreateUser: true } }));
      if (error) throw authFailure(error);
      return email;
    },
    async verifyCode(value: string, code: string): Promise<CustomerIdentity> {
      const gateway = requireAuth(); const email = customerEmail(value); const token = code.trim();
      if (!email) throw new CustomerAccountError('email', 'Enter a valid email address.');
      if (!/^\d{6,8}$/.test(token)) throw new CustomerAccountError('code', 'Enter the 6–8 digit code from your latest email.');
      const { error } = await authRequest(() => gateway.verifyOtp({ email, token, type: 'email' }));
      if (error) throw authFailure(error);
      const identity = await currentIdentity();
      if (!identity || identity.user.email !== email) throw authFailure(null);
      return identity;
    },
    async status(accessToken: string): Promise<CustomerAccountStatus> {
      const value = await request(accessToken, { action: 'status' });
      if (!value || Object.keys(value).sort().join(',') !== 'email,linked,updatedAt') throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.');
      return checkedStatus(value);
    },
    async link(accessToken: string, capabilities: CustomerAccountCapabilities): Promise<CustomerAccountStatus> {
      if (!validCustomerCapabilities(capabilities)) throw new CustomerAccountError('response', 'The device connection could not be read. Your current device data is unchanged.');
      const value = await request(accessToken, { action: 'link', ...capabilities });
      if (!value || Object.keys(value).sort().join(',') !== 'email,linked,updatedAt') throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.');
      const status = checkedStatus(value);
      if (!status.linked) throw new CustomerAccountError('response', 'The account connection was not confirmed. Try again.');
      return status;
    },
    async restore(accessToken: string): Promise<(CustomerAccountStatus & CustomerAccountCapabilities) | null> {
      const value = await request(accessToken, { action: 'restore' });
      const status = checkedStatus(value);
      if (!status.linked) {
        if (!value || Object.keys(value).sort().join(',') !== 'email,linked,updatedAt') throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.');
        return null;
      }
      if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'backupToken,commerceToken,email,linked,updatedAt') throw new CustomerAccountError('response', 'The account response could not be read. Your current device data is unchanged.');
      const record = value as CustomerAccountCapabilities;
      const capabilities = { commerceToken: record.commerceToken, backupToken: record.backupToken };
      if (!validCustomerCapabilities(capabilities)) throw new CustomerAccountError('response', 'The account connection could not be read. Your current device data is unchanged.');
      return { ...status, ...capabilities };
    },
    async signOut(expectedUserId?: string) {
      const gateway = requireAuth();
      if (expectedUserId) {
        const identity = await currentIdentity();
        if (identity && identity.user.id !== expectedUserId) throw new CustomerAccountError('changed', 'Your signed-in account changed. Review the email shown here and choose again.');
        const latest = await authRequest(() => gateway.getSession());
        if (latest.error) throw authFailure(latest.error);
        if (latest.data.session && latest.data.session.user.id !== expectedUserId) throw new CustomerAccountError('changed', 'Your signed-in account changed. Review the email shown here and choose again.');
      }
      const { error } = await authRequest(() => gateway.signOut({ scope: 'local' }));
      if (error) throw new CustomerAccountError('signout', 'We could not finish signing out. Keep this screen open and try again.');
    },
  };
}

const env = import.meta.env ?? {};
export const customerAuth = createCustomerAuth({ enabled: env.VITE_CUSTOMER_ACCOUNTS_ENABLED === 'true', url: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY });
export const linkCustomerAccount = customerAuth.link;
