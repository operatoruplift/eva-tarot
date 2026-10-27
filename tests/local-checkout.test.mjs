import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLocalCommerce, getSharedLocalCommerce, localCommerceEnabled, resetSharedLocalCommerce } from '../server/local-commerce.mjs';
import { createPaymentWebhookHandler, interpretPaymentWebhook, payosSignature } from '../server/payments-webhook.mjs';
import { ONE_QUESTION_PRICE_VND } from '../src/lib/public-catalog.ts';
import { buildVietQR } from '../src/lib/vietqr.ts';

const device = 'ab'.repeat(32);
const admin = 'Bearer secret-token';

function call(store, action, fields = {}, authorization) {
  return store.handle({ action, ...fields }, { deviceToken: device, authorization });
}

function order(store, productId, extra = {}) {
  return call(store, 'create_order', { productId, idempotencyKey: randomUUID(), ...extra });
}

function respond(handler, { method = 'POST', headers = {}, body } = {}) {
  return new Promise(resolve => {
    const response = {
      status: 0,
      writeHead(status) { this.status = status; },
      end(payload) { resolve({ status: this.status, body: JSON.parse(String(payload)) }); },
    };
    void handler({ method, headers, body }, response);
  });
}

test('local checkout stays off on Vercel and unless it is opted in', () => {
  assert.equal(localCommerceEnabled({ VERCEL: '1', EVA_COMMERCE_LOCAL: 'true' }), false);
  assert.equal(localCommerceEnabled({ EVA_COMMERCE_LOCAL: 'true' }), true);
  assert.equal(localCommerceEnabled({}), false);
  assert.equal(ONE_QUESTION_PRICE_VND, 25000);
});

test('a credit order stays pending until the owner confirms, then credits are granted once', () => {
  const store = createLocalCommerce({ adminToken: 'secret-token' });
  assert.equal(store.oneQuestionPrice, 25000);
  const created = order(store, 'five-questions', { contactEmail: 'guest@example.com' });
  assert.equal(created.status, 200);
  const first = created.body.order;
  assert.equal(first.status, 'pending');
  assert.equal(first.amount_vnd, 95000);
  assert.equal(first.credits, 5);
  assert.match(first.transfer_reference, /^EVA[A-F0-9]{12}$/);
  const second = order(store, 'three-questions');
  assert.notEqual(second.body.order.transfer_reference, first.transfer_reference);
  const qr = buildVietQR({ bankBin: '970407', accountNumber: '6886439999', amountVnd: first.amount_vnd, reference: first.transfer_reference });
  assert.match(qr, new RegExp(first.transfer_reference));
  const sent = call(store, 'transfer_sent', { orderId: first.id });
  assert.equal(sent.body.order.status, 'transfer_sent');
  assert.equal(call(store, 'wallet').body.wallet.credits, 1);
  const locked = createLocalCommerce();
  const lockedOrder = order(locked, 'one-question');
  assert.equal(call(locked, 'admin_confirm_payment', { orderId: lockedOrder.body.order.id, note: 'matched' }, admin).status, 503);
  assert.equal(call(store, 'admin_confirm_payment', { orderId: first.id, note: 'matched' }, 'Bearer wrong-token').status, 401);
  const confirmed = call(store, 'admin_confirm_payment', { orderId: first.id, note: 'matched statement' }, admin);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.order.status, 'confirmed');
  assert.equal(call(store, 'wallet').body.wallet.credits, 6);
  assert.equal(call(store, 'admin_confirm_payment', { orderId: first.id, note: 'again' }, admin).status, 200);
  assert.equal(call(store, 'wallet').body.wallet.credits, 6);
  const replayKey = randomUUID();
  const replay = call(store, 'create_order', { productId: 'one-question', idempotencyKey: replayKey });
  assert.equal(call(store, 'create_order', { productId: 'one-question', idempotencyKey: replayKey }).body.order.id, replay.body.order.id);
  assert.equal(call(store, 'create_order', { productId: 'three-questions', idempotencyKey: replayKey }).status, 409);
  assert.equal(replay.body.order.amount_vnd, 25000);
});

test('a confirmed donation adds no credits', () => {
  const store = createLocalCommerce({ adminToken: 'secret-token' });
  const created = call(store, 'create_donation', { amountVnd: 50000, idempotencyKey: randomUUID() });
  assert.equal(created.body.order.kind, 'donation');
  assert.equal(created.body.order.status, 'pending');
  assert.equal(call(store, 'admin_confirm_payment', { orderId: created.body.order.id, note: 'gift' }, admin).status, 200);
  assert.equal(call(store, 'wallet').body.wallet.credits, 1);
});

test('a consultation stays a booking and can be scheduled after payment', () => {
  const store = createLocalCommerce({ adminToken: 'secret-token' });
  const created = order(store, 'astrology', { customerNote: 'Saturday afternoon' });
  const booking = created.body.order;
  assert.equal(booking.kind, 'consultation');
  assert.equal(booking.amount_vnd, 600000);
  assert.equal(booking.credits, 0);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.booking_status, 'awaiting_payment');
  assert.equal(booking.customer_note, 'Saturday afternoon');
  assert.match(buildVietQR({ bankBin: '970407', accountNumber: '6886439999', amountVnd: booking.amount_vnd, reference: booking.transfer_reference }), new RegExp(booking.transfer_reference));
  assert.equal(call(store, 'admin_update_booking', { orderId: booking.id, bookingStatus: 'scheduled', scheduleNote: 'too early' }, admin).status, 409);
  const confirmed = call(store, 'admin_confirm_payment', { orderId: booking.id, note: 'paid' }, admin);
  assert.equal(confirmed.body.order.booking_status, 'paid');
  assert.equal(call(store, 'wallet').body.wallet.credits, 1);
  const scheduled = call(store, 'admin_update_booking', { orderId: booking.id, bookingStatus: 'scheduled', scheduleNote: 'Sunday 10:00' }, admin);
  assert.equal(scheduled.body.order.booking_status, 'scheduled');
  assert.equal(scheduled.body.order.schedule_note, 'Sunday 10:00');
  const dashboard = call(store, 'admin_dashboard', {}, admin);
  assert.equal(dashboard.body.commerceMode, 'local');
  assert.ok(dashboard.body.orders.some(item => item.id === booking.id && item.booking_status === 'scheduled' && item.schedule_note === 'Sunday 10:00'));
  assert.equal(call(store, 'wallet').body.orders.find(item => item.id === booking.id).schedule_note, 'Sunday 10:00');
});

test('a payment webhook does nothing until provider keys exist', async () => {
  const missing = interpretPaymentWebhook({}, { authorization: 'Apikey abcdefghijklmnop' }, { transferAmount: 95000, content: 'EVAABCDEF012345' });
  assert.equal(missing.status, 501);
  const handler = createPaymentWebhookHandler({ env: {} });
  const response = await respond(handler, { headers: { 'content-type': 'application/json' }, body: { transferAmount: 95000, content: 'EVAABCDEF012345' } });
  assert.equal(response.status, 501);
  assert.equal((await respond(handler, { method: 'GET' })).status, 405);
});

test('SePay confirms a matching memo once and rejects a wrong amount or key', () => {
  const store = createLocalCommerce({ adminToken: 'secret-token' });
  const created = order(store, 'five-questions').body.order;
  const env = { SEPAY_WEBHOOK_API_KEY: 'sepay-secret-key' };
  const wrongKey = interpretPaymentWebhook(env, { authorization: 'Apikey wrong-key-value' }, { transferAmount: 95000, content: created.transfer_reference });
  assert.equal(wrongKey.status, 401);
  const outgoing = interpretPaymentWebhook(env, { authorization: 'Apikey sepay-secret-key' }, { transferType: 'out', transferAmount: 95000, content: created.transfer_reference });
  assert.equal(outgoing.ignored, true);
  const noMemo = interpretPaymentWebhook(env, { authorization: 'Apikey sepay-secret-key' }, { transferAmount: 95000, content: 'lunch money' });
  assert.equal(noMemo.ignored, true);
  const matched = interpretPaymentWebhook(env, { authorization: 'Apikey sepay-secret-key' }, { transferAmount: 95000, content: `ck ${created.transfer_reference.toLowerCase()} eva`, id: 'txn-1' });
  assert.equal(matched.ok, true);
  assert.equal(matched.reference, created.transfer_reference);
  assert.equal(store.confirmByReference({ reference: matched.reference, amountVnd: 1, externalId: 'txn-1' }).status, 409);
  assert.equal(call(store, 'wallet').body.wallet.credits, 1);
  assert.equal(store.confirmByReference(matched).status, 200);
  assert.equal(store.confirmByReference(matched).status, 200);
  assert.equal(call(store, 'wallet').body.wallet.credits, 6);
});

test('payOS confirms only a signed successful transfer', () => {
  const store = createLocalCommerce({ adminToken: 'secret-token' });
  const created = order(store, 'three-questions').body.order;
  const env = { PAYMENT_WEBHOOK_PROVIDER: 'payos', PAYOS_CHECKSUM_KEY: 'payos-checksum-key', PAYOS_CLIENT_ID: 'client', PAYOS_API_KEY: 'api-key' };
  const data = { amount: 60000, description: created.transfer_reference, orderCode: 99 };
  const signature = payosSignature(data, env.PAYOS_CHECKSUM_KEY);
  assert.equal(interpretPaymentWebhook(env, {}, { code: '00', data, signature: '0'.repeat(64) }).status, 401);
  assert.equal(interpretPaymentWebhook(env, {}, { code: '01', data, signature }).ignored, true);
  const matched = interpretPaymentWebhook(env, {}, { code: '00', signature, data });
  assert.equal(matched.provider, 'payos');
  assert.equal(store.confirmByReference(matched).body.order.status, 'confirmed');
  assert.equal(call(store, 'wallet').body.wallet.credits, 4);
});

test('the webhook handler can confirm the local order store', async () => {
  resetSharedLocalCommerce();
  const env = { EVA_COMMERCE_LOCAL: 'true', EVA_LOCAL_ADMIN_TOKEN: 'secret-token', SEPAY_WEBHOOK_API_KEY: 'sepay-secret-key' };
  const store = getSharedLocalCommerce(env);
  const created = order(store, 'five-questions').body.order;
  const handler = createPaymentWebhookHandler({ env });
  const result = await respond(handler, {
    headers: { 'content-type': 'application/json', authorization: 'Apikey sepay-secret-key' },
    body: { transferAmount: 95000, content: created.transfer_reference, id: 'bank-9' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.order.status, 'confirmed');
  assert.equal(call(store, 'wallet').body.wallet.credits, 6);
  resetSharedLocalCommerce();
});
