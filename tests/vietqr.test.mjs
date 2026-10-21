import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_DONATION_QR, buildVietQR, qrChecksum } from '../src/lib/vietqr.ts';

function fields(value) {
  const result = {};
  for (let offset = 0; offset < value.length;) {
    const tag = value.slice(offset, offset + 2);
    const length = Number(value.slice(offset + 2, offset + 4));
    assert.ok(Number.isInteger(length));
    result[tag] = value.slice(offset + 4, offset + 4 + length);
    offset += 4 + length;
    assert.ok(offset <= value.length);
  }
  return result;
}

test('the supplied donation QR retains its decoded bank, account and checksum', () => {
  assert.equal(qrChecksum(SOURCE_DONATION_QR.slice(0, -4)), SOURCE_DONATION_QR.slice(-4));
  const decoded = fields(SOURCE_DONATION_QR);
  const merchant = fields(decoded['38']);
  const recipient = fields(merchant['01']);
  assert.equal(recipient['00'], '970407');
  assert.equal(recipient['01'], '6886439999');
  assert.equal(decoded['54'], undefined);
  assert.equal(buildVietQR({ bankBin: '970407', accountNumber: '6886439999' }), SOURCE_DONATION_QR);
});

test('order QR includes the exact price and reference without changing the recipient', () => {
  const value = buildVietQR({ bankBin: '970407', accountNumber: '6886439999', amountVnd: 60_000, reference: 'EVA A12B34C5' });
  assert.equal(qrChecksum(value.slice(0, -4)), value.slice(-4));
  const decoded = fields(value);
  assert.equal(decoded['01'], '12');
  assert.equal(decoded['54'], '60000');
  assert.equal(fields(decoded['62'])['08'], 'EVA A12B34C5');
  assert.deepEqual(fields(fields(decoded['38'])['01']), { '00': '970407', '01': '6886439999' });
});

test('invalid bank details, fractional amounts and malformed references cannot produce a payment QR', () => {
  const account = { bankBin: '970407', accountNumber: '6886439999' };
  for (const invalid of [{ bankBin: 'TCB' }, { accountNumber: 'other' }, { amountVnd: -1 }, { amountVnd: 2.5 }, { reference: '<script>' }]) {
    assert.throws(() => buildVietQR({ ...account, ...invalid }));
  }
});
