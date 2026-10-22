import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QRCode from 'qrcode';
import ts from 'typescript';
import { SOURCE_DONATION_QR, buildVietQR } from '../src/lib/vietqr.ts';

const source = await readFile(new URL('../src/components/CommercePage.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(`${source}\nexport { BankDetails, paymentPayload, DirectDonation };`, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const presentation = `data:text/javascript;base64,${Buffer.from('export function Brand(){return null;} export function Logo(){return null;} export function Modal(){return null;} export function useLanguage(){return {language:"en"};}').toString('base64')}`;
const rewritten = compiled.replace(/import\s+["']\.\/commerce\.css["'];?/g, '').replace(/from ["']([^"']+)["']/g, (_, specifier) => {
  if (['./Brand', './Modal', '../lib/i18n'].includes(specifier)) return `from ${JSON.stringify(presentation)}`;
  if (specifier.startsWith('../lib/')) return `from ${JSON.stringify(new URL(`../src/lib/${specifier.split('/').at(-1)}.ts`, import.meta.url).href)}`;
  return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
});
const { BankDetails, paymentPayload, DirectDonation } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
const settings = { bank_name: 'Techcombank', bank_bin: '970407', account_number: '6886439999', account_name: 'PRIVATE RECIPIENT' };
const order = { id: 'order-1', amount_vnd: 60000, transfer_reference: 'EVA A12B34C5', qr_payload: 'PRIVATE RECIPIENT in a legacy QR' };

test('public bank details never render or copy the legal name in either language', () => {
  for (const vi of [false, true]) {
    const html = renderToStaticMarkup(createElement(BankDetails, { settings, order, vi }));
    assert.doesNotMatch(html, /PRIVATE RECIPIENT/);
    assert.match(html, /Techcombank/);
    assert.match(html, /6886439999/);
    assert.match(html, /EVA A12B34C5/);
    assert.match(html, /60[,.]000/);
  }
});

test('order QR is rebuilt from exact payment routing rather than legacy named QR metadata', () => {
  assert.equal(paymentPayload(order, settings), buildVietQR({ bankBin: settings.bank_bin, accountNumber: settings.account_number, amountVnd: 60000, reference: order.transfer_reference }));
  assert.equal(paymentPayload(order, {}), undefined);
  assert.equal(paymentPayload({ ...order, amount_vnd: -1 }, settings), undefined);
});

test('fallback donation image and accessible label expose only routing and honest bank verification guidance', () => {
  for (const vi of [false, true]) {
    const html = renderToStaticMarkup(createElement(DirectDonation, { vi }));
    assert.match(html, /\/payments\/donation-qr.svg/);
    assert.match(html, /Techcombank/);
    assert.match(html, /6886439999/);
    assert.match(html, vi ? /tên pháp lý/ : /legal name/);
    assert.doesNotMatch(html, /PRIVATE RECIPIENT/);
  }
});

test('downloadable donation SVG encodes only the original nameless bank-routing payload', async () => {
  const expected = await QRCode.toString(SOURCE_DONATION_QR, { type: 'svg', margin: 4, width: 400, errorCorrectionLevel: 'M', color: { light: '#FFFFFF', dark: '#000000' } });
  const asset = await readFile(new URL('../public/payments/donation-qr.svg', import.meta.url), 'utf8');
  assert.equal(asset.trim(), expected.trim());
  assert.doesNotMatch(SOURCE_DONATION_QR, /PRIVATE RECIPIENT/);
});
