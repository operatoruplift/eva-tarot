import { readConnection } from './account-connection.ts';

export type CommerceProduct = {
  id: string; title_en: string; title_vi: string; description_en?: string; description_vi?: string;
  price_vnd: number; credits: number; active: boolean; sort_order?: number; category?: string; kind?: 'credits' | 'consultation';
};
export type CommerceSettings = {
  pricing_mode?: 'paid' | 'consultations' | 'free_trial'; free_trial_credits?: number;
  bank_name?: string; bank_bin?: string; account_number?: string; account_name?: string; qr_payload?: string;
  support_email?: string; announcement_en?: string; announcement_vi?: string;
  hero_title_en?: string; hero_title_vi?: string; hero_description_en?: string; hero_description_vi?: string;
  donations_enabled?: boolean; donation_suggested_vnd?: number[];
  [key: string]: unknown;
};
export type CommerceCatalog = { products: CommerceProduct[]; settings: CommerceSettings };
export type CommerceWallet = { id: string; credits: number; created_at?: string; contact_email?: string | null };
export type CommerceOrder = {
  id: string; status: 'pending' | 'transfer_sent' | 'confirmed' | 'rejected'; amount_vnd: number;
  credits: number; kind?: 'credits' | 'consultation' | 'donation'; product_id?: string | null;
  product_snapshot?: CommerceProduct; product_title_en?: string; product_title_vi?: string; product_title?: string;
  contact_email?: string | null; created_at: string; updated_at?: string; paid_at?: string | null;
  transfer_reference?: string; reference?: string; qr_payload?: string; note?: string | null; payment_note?: string;
  wallet_id?: string; [key: string]: unknown;
};
export type WalletResponse = { wallet: CommerceWallet; orders: CommerceOrder[] };
export type DashboardCustomer = CommerceWallet & { order_count?: number; paid_vnd?: number; last_order_at?: string | null; display_name?: string; admin_notes?: string; last_seen_at?: string };
export type CommerceDay = { day: string; visits: number; readings: number; revenue_vnd: number };
export type AdminDashboardData = {
  catalog: CommerceCatalog; orders: CommerceOrder[]; customers: DashboardCustomer[]; admin: { email: string };
  summary: { customers: number; orders: number; pendingPayments: number; confirmedRevenueVnd: number; confirmedDonationsVnd: number; completedReadings: number; visitors30d: number; pageViews30d: number; landingViews30d?: number; pricingViews30d?: number; chatStarts30d?: number; daily: CommerceDay[] };
};

const DEVICE_KEY = 'eva-commerce-device';
export class CommerceError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.name = 'CommerceError'; this.status = status; }
}
/** A wallet is created only after the browser has durably stored its secret. */
export function getDeviceToken(): string {
  if (typeof localStorage === 'undefined') throw new CommerceError('This browser cannot save your wallet. Allow site storage before making a payment.');
  try {
    const connection = readConnection();
    if (connection) return connection.account?.commerceToken ?? connection.guest.commerceToken;
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, token);
    if (localStorage.getItem(DEVICE_KEY) !== token) throw new Error('Storage did not persist');
    return token;
  } catch { throw new CommerceError('This browser cannot save your wallet. Allow site storage before making a payment.'); }
}
export function getCommerceHeaders(): Record<string, string> { return { 'X-Eva-Device': getDeviceToken() }; }

type RequestOptions = { adminToken?: string; signal?: AbortSignal; device?: boolean };
export async function commerceRequest<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch('/api/commerce', {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.adminToken ? { Authorization: `Bearer ${options.adminToken}` } : {}), ...(options.device ? getCommerceHeaders() : {}) },
      body: JSON.stringify({ ...payload, action }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const data = body && typeof body === 'object' ? body as Record<string, unknown> : null;
      const nested = data?.error;
      const message = typeof nested === 'string' ? nested : nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).message === 'string' ? String((nested as Record<string, unknown>).message) : typeof data?.message === 'string' ? data.message : 'Could not reach the payment service. Please try again.';
      throw new CommerceError(message, response.status);
    }
    if (!body || typeof body !== 'object') throw new CommerceError('The payment service returned an unreadable response. Please try again.', 502);
    return body as T;
  } catch (cause) {
    if (cause instanceof CommerceError) throw cause;
    throw new CommerceError(controller.signal.aborted ? 'The request took too long. Check your orders before trying again.' : 'Could not connect. Check your internet connection and try again.');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
export async function getWallet(signal?: AbortSignal): Promise<WalletResponse> {
  const result = await commerceRequest<WalletResponse>('wallet', {}, { device: true, signal });
  if (!result.wallet || typeof result.wallet.id !== 'string' || !Number.isSafeInteger(result.wallet.credits) || !Array.isArray(result.orders)) throw new CommerceError('Your wallet response could not be read. Please refresh your orders.', 502);
  return result;
}
export function formatVnd(value: number, vietnamese = false): string { return new Intl.NumberFormat(vietnamese ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value); }
export function orderReference(order: CommerceOrder): string { return order.transfer_reference || order.reference || order.id; }
