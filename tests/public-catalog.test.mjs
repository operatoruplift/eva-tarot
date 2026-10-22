import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_DONATION_DETAILS, PUBLIC_REFERENCE_CATALOG, canPurchaseProduct, publicDonationFallbackAllowed } from '../src/lib/public-catalog.ts';
import { SOURCE_DONATION_QR } from '../src/lib/vietqr.ts';

test('the owner reference menu retains the supplied prices without enabling checkout', () => {
  const prices = Object.fromEntries(PUBLIC_REFERENCE_CATALOG.products.map(product => [product.id, product.price_vnd]));
  assert.deepEqual(prices, { 'one-question': 25000, 'three-questions': 60000, 'five-questions': 95000, 'love-reading': 70000, 'work-reading': 70000, 'life-reading': 70000, 'one-month': 100000, 'three-months': 250000, 'six-months': 450000, 'mother-baby': 150000, lenormand: 100000, astrology: 600000 });
  for (const product of PUBLIC_REFERENCE_CATALOG.products) {
    assert.equal(product.active, false);
    assert.equal(canPurchaseProduct(product, { pricing_mode: 'paid' }, false), false);
    assert.equal(canPurchaseProduct(product, { pricing_mode: 'paid' }, true), false);
  }
});
test('a cached paid catalog cannot sell during an outage and a successful catalog controls purchase mode', () => {
  const credit = { ...PUBLIC_REFERENCE_CATALOG.products[0], active: true };
  const manual = { ...PUBLIC_REFERENCE_CATALOG.products[3], active: true };
  assert.equal(canPurchaseProduct(credit, { pricing_mode: 'paid' }, false), false);
  assert.equal(canPurchaseProduct(credit, { pricing_mode: 'consultations' }, true), false);
  assert.equal(canPurchaseProduct(credit, { pricing_mode: 'free_trial' }, true), true);
  assert.equal(canPurchaseProduct(manual, { pricing_mode: 'consultations' }, true), true);
  assert.equal(canPurchaseProduct(credit, {}, true), false);
});
test('public donation details preserve bank routing without exposing a legal name', () => {
  assert.equal(PUBLIC_DONATION_DETAILS.qr_payload, SOURCE_DONATION_QR);
  assert.equal(PUBLIC_DONATION_DETAILS.account_number, '6886439999');
  assert.equal(PUBLIC_DONATION_DETAILS.bank_bin, '970407');
  assert.equal(Object.hasOwn(PUBLIC_DONATION_DETAILS, 'account_name'), false);
});
test('donation fallback requires explicit unconfigured status and never overrides a pause or known bank settings', () => {
  assert.equal(publicDonationFallbackAllowed(undefined, true, false), true);
  assert.equal(publicDonationFallbackAllowed(undefined, false, false), false);
  assert.equal(publicDonationFallbackAllowed({ donations_enabled: false }, true, false), false);
  assert.equal(publicDonationFallbackAllowed({ donations_enabled: true, account_number: '12345678' }, true, true), false);
});
