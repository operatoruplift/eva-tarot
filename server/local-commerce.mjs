import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { catalogProducts, ONE_QUESTION_PRICE_VND, SALE_SETTINGS } from '../src/lib/public-catalog.ts';
import { publicCommerceSettings, validProduct, validSettings } from '../supabase/functions/commerce/index.ts';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const deviceTokenOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const emailOk = value => typeof value === 'string' && value.length >= 3 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const noteOk = value => typeof value === 'string' && value.length <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const REFERENCE = /^EVA[A-F0-9]{12}$/;

/** In-memory checkout is for local development only. Never enable it on Vercel. */
export function localCommerceEnabled(env = process.env) {
  if (env.VERCEL === '1') return false;
  return env.EVA_COMMERCE_LOCAL === 'true';
}

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) return false;
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

function cleanNote(value) {
  if (value === undefined || value === null || value === '') return '';
  return noteOk(value) ? value : null;
}

let shared;
export function getSharedLocalCommerce(env = process.env) {
  if (!shared) shared = createLocalCommerce({ adminToken: env.EVA_LOCAL_ADMIN_TOKEN || '' });
  return shared;
}
export function resetSharedLocalCommerce() { shared = undefined; }

export function createLocalCommerce({ adminToken = '', now = () => Date.now() } = {}) {
  const wallets = new Map();
  const orders = [];
  const ledger = [];
  const events = [];
  const reservations = new Map();
  let products = catalogProducts(true).map(product => ({ ...product }));
  let settings = structuredClone(SALE_SETTINGS);
  const iso = () => new Date(now()).toISOString();
  const dayAgo = () => now() - 86_400_000;

  function publicOrder(order) {
    const { idempotencyKey, walletId, credited, ...rest } = order;
    return rest;
  }
  function walletPublic(wallet) {
    return { id: wallet.id, credits: wallet.credits, created_at: wallet.created_at, contact_email: wallet.contact_email };
  }
  function fail(status, error) { return { status, body: { error } }; }
  function ok(body) { return { status: 200, body }; }

  function ensureWallet(deviceHash, { create = true } = {}) {
    let wallet = wallets.get(deviceHash);
    if (!wallet && !create) return null;
    if (!wallet) {
      wallet = {
        id: randomUUID(), deviceHash, credits: 0, contact_email: null, display_name: '', admin_notes: '',
        created_at: iso(), last_seen_at: iso(), trialGranted: false,
      };
      wallets.set(deviceHash, wallet);
    }
    for (const reservation of reservations.values()) {
      if (reservation.walletId === wallet.id && reservation.status === 'reserved' && now() - reservation.createdAt > 5 * 60_000) {
        if (!ledger.some(entry => entry.readingId === reservation.id && entry.reason === 'refund')) {
          ledger.push({ id: randomUUID(), walletId: wallet.id, readingId: reservation.id, delta: reservation.cost, reason: 'refund' });
          wallet.credits += reservation.cost;
        }
        reservation.status = 'refunded';
      }
    }
    const trial = Math.max(0, Math.min(10, Number(settings.free_trial_credits) || 0));
    if (settings.pricing_mode === 'free_trial' && trial > 0 && !wallet.trialGranted && !ledger.some(entry => entry.walletId === wallet.id && entry.reason === 'trial')) {
      ledger.push({ id: randomUUID(), walletId: wallet.id, delta: trial, reason: 'trial' });
      wallet.credits += trial;
      wallet.trialGranted = true;
    }
    wallet.last_seen_at = iso();
    return wallet;
  }

  function requireDevice(deviceToken) {
    if (!deviceTokenOk(deviceToken)) return { error: fail(401, 'Open your private wallet on this device to continue.') };
    return { wallet: ensureWallet(sha256(deviceToken)) };
  }

  function requireAdmin(authorization) {
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!adminToken) return fail(503, 'Set EVA_LOCAL_ADMIN_TOKEN in the server environment before reviewing payments locally.');
    if (!tokenMatches(token, adminToken)) return fail(401, 'Sign in to the owner dashboard.');
    return null;
  }

  function reference() {
    const used = new Set(orders.map(order => order.transfer_reference));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const next = `EVA${randomBytes(6).toString('hex').toUpperCase()}`;
      if (!used.has(next)) return next;
    }
    throw new Error('reference');
  }

  function confirmOrder(order, note) {
    if (order.status === 'confirmed') return order;
    if (order.status === 'rejected') {
      const error = new Error('Rejected payment requires a new order');
      error.status = 409;
      throw error;
    }
    if (order.kind === 'credits' && order.credits > 0 && !ledger.some(entry => entry.orderId === order.id && entry.reason === 'purchase')) {
      const wallet = [...wallets.values()].find(item => item.id === order.walletId);
      ledger.push({ id: randomUUID(), walletId: order.walletId, orderId: order.id, delta: order.credits, reason: 'purchase' });
      if (wallet) wallet.credits += order.credits;
      order.credited = true;
    }
    order.status = 'confirmed';
    order.confirmed_at = iso();
    order.payment_note = String(note || '').slice(0, 500);
    if (order.kind === 'consultation' && (order.booking_status === 'awaiting_payment' || order.booking_status === 'none')) order.booking_status = 'paid';
    return order;
  }

  function catalog(admin) {
    const visible = products.slice().sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0) || left.id.localeCompare(right.id));
    return {
      products: (admin ? visible : visible.filter(product => product.active)).map(product => ({ ...product })),
      settings: admin ? structuredClone(settings) : publicCommerceSettings(settings),
    };
  }

  function summary() {
    const confirmed = orders.filter(order => order.status === 'confirmed');
    return {
      customers: wallets.size,
      orders: orders.length,
      pendingPayments: orders.filter(order => order.status === 'pending' || order.status === 'transfer_sent').length,
      confirmedRevenueVnd: confirmed.filter(order => order.kind !== 'donation').reduce((sum, order) => sum + order.amount_vnd, 0),
      confirmedDonationsVnd: confirmed.filter(order => order.kind === 'donation').reduce((sum, order) => sum + order.amount_vnd, 0),
      completedReadings: events.filter(event => event.event === 'reading_completed').length,
      visitors30d: new Set(events.map(event => event.visitor_hash)).size,
      pageViews30d: events.filter(event => event.event === 'page_view' || event.event === 'landing_view').length,
      landingViews30d: events.filter(event => event.event === 'landing_view' || (event.event === 'page_view' && event.page === 'landing')).length,
      pricingViews30d: events.filter(event => event.event === 'pricing_view').length,
      chatStarts30d: events.filter(event => event.event === 'start_chat').length,
      daily: [],
    };
  }

  function reserveReading({ deviceToken, requestId, fingerprint }) {
    if (!deviceTokenOk(deviceToken) || !uuid(requestId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) {
      return { required: true, allowed: false, status: 'invalid' };
    }
    const wallet = ensureWallet(sha256(deviceToken));
    if (settings.pricing_mode === 'consultations') return { required: false, allowed: true, configured: true };
    const existing = reservations.get(requestId);
    if (existing) {
      if (existing.walletId !== wallet.id || existing.fingerprint !== fingerprint) {
        const error = new Error('Reading request already used');
        error.status = 409;
        throw error;
      }
      const expired = existing.status === 'completed' && existing.response && existing.expiresAt <= now();
      if (expired) existing.response = null;
      return {
        required: true, allowed: existing.status === 'completed', new: false,
        status: existing.status === 'completed' && !existing.response ? 'expired' : existing.status,
        credits: wallet.credits, reservationId: existing.id, response: existing.response || undefined,
      };
    }
    if (wallet.credits < 1) return { required: true, allowed: false, status: 'insufficient_credits', credits: wallet.credits };
    reservations.set(requestId, { id: requestId, walletId: wallet.id, fingerprint, cost: 1, status: 'reserved', response: null, expiresAt: 0, createdAt: now() });
    ledger.push({ id: randomUUID(), walletId: wallet.id, readingId: requestId, delta: -1, reason: 'reading' });
    wallet.credits -= 1;
    return { required: true, allowed: true, new: true, status: 'reserved', credits: wallet.credits, reservationId: requestId };
  }

  function finishReading({ deviceToken, requestId, response }) {
    if (!deviceTokenOk(deviceToken) || !uuid(requestId)) return false;
    const wallet = ensureWallet(sha256(deviceToken), { create: false });
    const reservation = reservations.get(requestId);
    if (!wallet || !reservation || reservation.walletId !== wallet.id) return false;
    if (reservation.status === 'completed') return true;
    if (reservation.status !== 'reserved' || !response || typeof response !== 'object') return false;
    reservation.status = 'completed';
    reservation.response = response;
    reservation.expiresAt = now() + 15 * 60_000;
    events.push({ event: 'reading_completed', visitor_hash: sha256(deviceToken), reading_id: requestId, at: now() });
    return true;
  }

  function refundReading({ deviceToken, requestId }) {
    if (!deviceTokenOk(deviceToken) || !uuid(requestId)) return false;
    const wallet = ensureWallet(sha256(deviceToken), { create: false });
    const reservation = reservations.get(requestId);
    if (!wallet || !reservation || reservation.walletId !== wallet.id || reservation.status !== 'reserved') return false;
    if (!ledger.some(entry => entry.readingId === requestId && entry.reason === 'refund')) {
      ledger.push({ id: randomUUID(), walletId: wallet.id, readingId: requestId, delta: reservation.cost, reason: 'refund' });
      wallet.credits += reservation.cost;
    }
    reservation.status = 'refunded';
    return true;
  }

  function confirmByReference({ reference, amountVnd, externalId = '' }) {
    if (!REFERENCE.test(reference) || !Number.isSafeInteger(amountVnd)) return fail(400, 'The transfer could not be matched.');
    const order = orders.find(item => item.transfer_reference === reference);
    if (!order) return fail(404, 'This order was not found.');
    if (order.amount_vnd !== amountVnd) return fail(409, 'Transfer amount does not match the order.');
    try { confirmOrder(order, `webhook:${externalId}`); }
    catch (error) { return fail(error.status || 409, error.message); }
    return ok({ ok: true, order: publicOrder(order) });
  }

  function handle(body, { deviceToken, authorization } = {}) {
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') return fail(400, 'Choose an action.');
    const keys = allowed => Object.keys(body).every(key => key === 'action' || allowed.includes(key));
    try {
      if (body.action === 'catalog') {
        if (!keys([])) return fail(400, 'This request contains unsupported fields.');
        return ok({ catalog: catalog(false), commerceMode: 'local' });
      }
      if (body.action === 'track_event') {
        if (!keys(['name', 'page'])) return fail(400, 'This request contains unsupported fields.');
        if (!['page_view', 'start_chat', 'pricing_view'].includes(body.name) || !['landing', 'app', 'pricing', 'support', 'terms'].includes(body.page)) return fail(400, 'Unsupported event.');
        events.push({ event: body.name, page: body.page, visitor_hash: deviceTokenOk(deviceToken) ? sha256(deviceToken) : sha256(randomUUID()), at: now() });
        return ok({ ok: true });
      }
      if (body.action === 'record_event') {
        if (!keys(['event'])) return fail(400, 'This request contains unsupported fields.');
        const found = requireDevice(deviceToken);
        if (found.error) return found.error;
        if (!['landing_view', 'pricing_view', 'checkout_started'].includes(body.event)) return fail(400, 'Unsupported event.');
        events.push({ event: body.event, visitor_hash: sha256(deviceToken), at: now() });
        return ok({ ok: true });
      }
      if (body.action === 'wallet') {
        if (!keys([])) return fail(400, 'This request contains unsupported fields.');
        const found = requireDevice(deviceToken);
        if (found.error) return found.error;
        const mine = orders.filter(order => order.walletId === found.wallet.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
        return ok({ wallet: walletPublic(found.wallet), orders: mine.map(publicOrder) });
      }
      if (body.action === 'create_order' || body.action === 'create_donation') {
        const allowed = body.action === 'create_order' ? ['productId', 'idempotencyKey', 'contactEmail', 'customerNote'] : ['amountVnd', 'idempotencyKey', 'contactEmail'];
        if (!keys(allowed)) return fail(400, 'This request contains unsupported fields.');
        const found = requireDevice(deviceToken);
        if (found.error) return found.error;
        if (!uuid(body.idempotencyKey) || (body.contactEmail !== undefined && body.contactEmail !== '' && !emailOk(body.contactEmail))) return fail(400, 'Use a valid order reference and email address.');
        const note = cleanNote(body.customerNote);
        if (note === null) return fail(400, 'The booking note could not be read.');
        const wallet = found.wallet;
        const previous = orders.find(order => order.walletId === wallet.id && order.idempotencyKey === body.idempotencyKey);
        if (previous) {
          const sameProduct = body.action === 'create_donation' ? previous.kind === 'donation' && previous.amount_vnd === body.amountVnd : previous.product_id === body.productId && previous.customer_note === note;
          if (!sameProduct) return fail(409, 'This request conflicts with an existing order, or the option is no longer available. Please refresh and try again.');
          return ok({ order: publicOrder(previous) });
        }
        const pending = orders.filter(order => order.walletId === wallet.id && (order.status === 'pending' || order.status === 'transfer_sent') && Date.parse(order.created_at) > dayAgo());
        if (pending.length >= 10) return fail(429, 'Please finish an existing payment before creating another order.');
        const contact = body.contactEmail ? String(body.contactEmail).toLowerCase() : null;
        if (body.action === 'create_donation') {
          if (settings.donations_enabled === false || !Number.isSafeInteger(body.amountVnd) || body.amountVnd < 1000 || body.amountVnd > 10_000_000) return fail(409, 'Donation is unavailable');
          const order = {
            id: randomUUID(), walletId: wallet.id, idempotencyKey: body.idempotencyKey, product_id: null,
            product_snapshot: { title_en: 'Voluntary donation', title_vi: 'Ủng hộ tự nguyện' }, kind: 'donation',
            amount_vnd: body.amountVnd, credits: 0, status: 'pending', transfer_reference: reference(), contact_email: contact,
            customer_note: '', schedule_note: '', booking_status: 'none', payment_note: '', created_at: iso(),
          };
          orders.push(order);
          if (contact) wallet.contact_email = contact;
          return ok({ order: publicOrder(order) });
        }
        if (typeof body.productId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(body.productId)) return fail(400, 'Choose a reading option.');
        const product = products.find(item => item.id === body.productId && item.active);
        if (!product) return fail(409, 'This option is unavailable');
        if (product.kind === 'credits' && settings.pricing_mode === 'consultations') return fail(409, 'AI readings are currently free');
        const order = {
          id: randomUUID(), walletId: wallet.id, idempotencyKey: body.idempotencyKey, product_id: product.id,
          product_snapshot: { ...product }, kind: product.kind, amount_vnd: product.price_vnd, credits: product.credits,
          status: 'pending', transfer_reference: reference(), contact_email: contact, customer_note: note, schedule_note: '',
          booking_status: product.kind === 'consultation' ? 'awaiting_payment' : 'none', payment_note: '', created_at: iso(),
        };
        orders.push(order);
        if (contact) wallet.contact_email = contact;
        return ok({ order: publicOrder(order) });
      }
      if (body.action === 'transfer_sent') {
        if (!keys(['orderId'])) return fail(400, 'This request contains unsupported fields.');
        const found = requireDevice(deviceToken);
        if (found.error) return found.error;
        if (!uuid(body.orderId)) return fail(400, 'Choose a valid order.');
        const order = orders.find(item => item.id === body.orderId && item.walletId === found.wallet.id);
        if (!order) return fail(404, 'This order was not found in your wallet.');
        if (order.status === 'pending') { order.status = 'transfer_sent'; order.transfer_sent_at = iso(); }
        return ok({ order: publicOrder(order) });
      }
      if (body.action.startsWith('reading_')) return fail(403, 'Server authorization is required.');
      if (!body.action.startsWith('admin_')) return fail(400, 'This action is not supported.');
      const denied = requireAdmin(authorization);
      if (denied) return denied;
      if (body.action === 'admin_dashboard') {
        if (!keys([])) return fail(400, 'This request contains unsupported fields.');
        const customers = [...wallets.values()].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)).slice(0, 200).map(wallet => ({
          id: wallet.id, credits: wallet.credits, contact_email: wallet.contact_email, display_name: wallet.display_name,
          admin_notes: wallet.admin_notes, created_at: wallet.created_at, last_seen_at: wallet.last_seen_at,
        }));
        return ok({
          summary: summary(), customers, orders: orders.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map(publicOrder),
          catalog: catalog(true), admin: { email: 'local owner' }, commerceMode: 'local',
        });
      }
      if (body.action === 'admin_confirm_payment' || body.action === 'admin_reject_payment') {
        if (!keys(['orderId', 'note'])) return fail(400, 'This request contains unsupported fields.');
        if (!uuid(body.orderId) || (body.note !== undefined && !noteOk(String(body.note)))) return fail(400, 'Choose an order and a short payment note.');
        const order = orders.find(item => item.id === body.orderId);
        if (!order) return fail(404, 'This order was not found.');
        if (body.action === 'admin_reject_payment') {
          if (order.status === 'confirmed') return fail(409, 'Confirmed payments cannot be rejected');
          if (order.status !== 'rejected') {
            order.status = 'rejected';
            order.payment_note = String(body.note || '').slice(0, 500);
            if (order.kind === 'consultation') order.booking_status = 'cancelled';
          }
          return ok({ order: publicOrder(order) });
        }
        try { confirmOrder(order, body.note || ''); }
        catch (error) { return fail(error.status || 409, error.message); }
        return ok({ order: publicOrder(order) });
      }
      if (body.action === 'admin_update_booking') {
        if (!keys(['orderId', 'bookingStatus', 'scheduleNote'])) return fail(400, 'This request contains unsupported fields.');
        if (!uuid(body.orderId) || !['paid', 'scheduled', 'completed', 'cancelled'].includes(body.bookingStatus) || !noteOk(String(body.scheduleNote ?? ''))) return fail(400, 'Check the booking status and note.');
        const order = orders.find(item => item.id === body.orderId);
        if (!order) return fail(404, 'This order was not found.');
        if (order.kind !== 'consultation') return fail(409, 'Not a consultation booking');
        if (order.status !== 'confirmed') return fail(409, 'Confirm the transfer before updating this booking');
        order.booking_status = body.bookingStatus;
        order.schedule_note = String(body.scheduleNote ?? '');
        return ok({ order: publicOrder(order) });
      }
      if (body.action === 'admin_update_product') {
        if (!keys(['product']) || !validProduct(body.product)) return fail(400, 'Check the price, credits, and product details.');
        const next = { ...body.product };
        const index = products.findIndex(item => item.id === next.id);
        if (index >= 0) products[index] = next;
        else products.push(next);
        return ok({ product: next });
      }
      if (body.action === 'admin_update_settings') {
        if (!keys(['settings']) || !validSettings(body.settings)) return fail(400, 'Check the payment and website settings.');
        settings = { ...settings, ...body.settings };
        return ok({ settings });
      }
      if (body.action === 'admin_update_customer') {
        if (!keys(['customerId', 'displayName', 'notes'])) return fail(400, 'This request contains unsupported fields.');
        if (!uuid(body.customerId) || !noteOk(String(body.displayName)) || String(body.displayName).length > 80 || !noteOk(String(body.notes)) || String(body.notes).length > 2000) return fail(400, 'Check the customer name and notes.');
        const wallet = [...wallets.values()].find(item => item.id === body.customerId);
        if (!wallet) return fail(404, 'This customer was not found.');
        wallet.display_name = body.displayName;
        wallet.admin_notes = body.notes;
        return ok({ customer: { id: wallet.id, credits: wallet.credits, contact_email: wallet.contact_email, display_name: wallet.display_name, admin_notes: wallet.admin_notes } });
      }
      return fail(400, 'This dashboard action is not supported.');
    } catch {
      return fail(503, 'Payments are temporarily unavailable. Please try again.');
    }
  }

  return { handle, reserveReading, finishReading, refundReading, confirmByReference, oneQuestionPrice: ONE_QUESTION_PRICE_VND };
}
