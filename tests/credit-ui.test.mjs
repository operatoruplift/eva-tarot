import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { availableCreditProducts, createCreditRefresh, requiresReadingCredits } from '../src/lib/credit-ui.ts';
import { ReadingServiceError } from '../src/lib/readings.ts';

const catalog = (mode = 'free_trial') => ({ settings: { pricing_mode: mode }, products: [] });
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('only a typed credits_required payment response opens the credit flow', () => {
  assert.equal(requiresReadingCredits(new ReadingServiceError('Out of credits', 402, 'credits_required')), true);
  for (const error of [new ReadingServiceError('Outage', 503, 'credits_required'), new ReadingServiceError('Payment problem', 402, 'payment_unavailable'), new Error('credits_required'), { status: 402, code: 'credits_required' }, null]) {
    assert.equal(requiresReadingCredits(error), false);
  }
});

test('the sheet lists only current active purchasable credit packages', () => {
  const product = { id: 'custom', title_en: 'A changed package', title_vi: 'Gói mới', price_vnd: 41000, credits: 2, active: true, kind: 'credits' };
  const products = [product, { ...product, id: 'inactive', active: false }, { ...product, id: 'human', kind: 'consultation' }, { ...product, id: 'invalid', price_vnd: -1 }];
  assert.deepEqual(availableCreditProducts({ settings: {}, products }), [product]);
  assert.deepEqual(products.map(item => item.id), ['custom', 'inactive', 'human', 'invalid']);
});

test('catalog must confirm paid policy before any wallet request; resume events coalesce', async () => {
  const policy = pending();
  let catalogs = 0; let wallets = 0;
  const updates = [];
  const coordinator = createCreditRefresh({ loadCatalog: () => { catalogs++; return policy.promise; }, loadWallet: async () => { wallets++; return { id: 'wallet', credits: 4 }; }, onUpdate: state => updates.push(state) });
  const first = coordinator.refresh();
  assert.equal(coordinator.refresh(), first);
  assert.equal(coordinator.refresh(), first);
  assert.equal(catalogs, 1);
  assert.equal(wallets, 0);
  policy.resolve(catalog());
  await first;
  assert.equal(wallets, 1);
  assert.equal(updates.at(-1).wallet.credits, 4);
  assert.equal(updates.at(-1).loading, false);
});

test('free policy never creates a wallet and clears an older paid balance', async () => {
  let mode = 'paid'; let wallets = 0; const updates = [];
  const coordinator = createCreditRefresh({ loadCatalog: async () => catalog(mode), loadWallet: async () => { wallets++; return { id: 'wallet', credits: 7 }; }, onUpdate: state => updates.push(state) });
  await coordinator.refresh();
  mode = 'consultations';
  await coordinator.refresh();
  assert.equal(wallets, 1);
  assert.equal(updates.at(-1).wallet, null);
  assert.equal(updates.at(-1).unavailable, false);
});

test('reply completion invalidates a balance request already in flight exactly once', async () => {
  const firstWallet = pending(); let wallets = 0; const updates = [];
  const coordinator = createCreditRefresh({ loadCatalog: async () => catalog(), loadWallet: () => { wallets++; return wallets === 1 ? firstWallet.promise : Promise.resolve({ id: 'wallet', credits: 2 }); }, onUpdate: state => updates.push(state) });
  const refresh = coordinator.refresh();
  await Promise.resolve();
  coordinator.refresh(true); coordinator.refresh(true);
  firstWallet.resolve({ id: 'wallet', credits: 3 });
  await refresh;
  assert.equal(wallets, 2);
  assert.equal(updates.at(-1).wallet.credits, 2);
});

test('wallet failures retain known policy, mark the balance unavailable, and recover on resume', async () => {
  let fail = true; const updates = [];
  const coordinator = createCreditRefresh({ loadCatalog: async () => catalog(), loadWallet: async () => { if (fail) throw new Error('Network unavailable'); return { id: 'wallet', credits: 6 }; }, onUpdate: state => updates.push(state) });
  await coordinator.refresh();
  assert.equal(updates.at(-1).catalog.settings.pricing_mode, 'free_trial');
  assert.equal(updates.at(-1).unavailable, true);
  assert.equal(updates.at(-1).wallet, null);
  fail = false;
  await coordinator.refresh();
  assert.equal(updates.at(-1).wallet.credits, 6);
  assert.equal(updates.at(-1).unavailable, false);
});

test('disposing prevents stale updates and a delayed catalog from creating a wallet', async () => {
  const policy = pending(); let wallets = 0; const updates = [];
  const coordinator = createCreditRefresh({ loadCatalog: () => policy.promise, loadWallet: async () => { wallets++; return { id: 'wallet', credits: 1 }; }, onUpdate: state => updates.push(state) });
  const refresh = coordinator.refresh();
  coordinator.dispose();
  policy.resolve(catalog());
  await refresh;
  assert.equal(wallets, 0);
  assert.equal(updates.length, 1);
  await coordinator.refresh();
  assert.equal(updates.length, 1);
});

const source = await readFile(new URL('../src/components/CreditPaywall.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const presentation = `data:text/javascript;base64,${Buffer.from("import {createElement} from '" + import.meta.resolve('react') + "'; export function Modal({title,children}){return createElement('section',{'aria-label':title},children);} export function useLanguage(){return {language:'en'};}").toString('base64')}`;
const rewritten = compiled.replace(/import\s+["']\.\/credit-paywall\.css["'];?/g, '').replace(/from ["']([^"']+)["']/g, (_, specifier) => {
  if (specifier === './Modal' || specifier === '../lib/i18n') return `from ${JSON.stringify(presentation)}`;
  if (specifier.startsWith('../lib/')) return `from ${JSON.stringify(new URL(`../src/lib/${specifier.split('/').at(-1)}.ts`, import.meta.url).href)}`;
  return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
});
const { CreditPaywall } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);

test('dismissing or opening pricing never sends a message; native dialog closes before navigation', async t => {
  const original = { act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch, error: console.error };
  const actions = []; let root;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = () => assert.fail('The paywall must not submit or charge automatically');
  console.error = () => {};
  t.after(async () => { if (root) await act(async () => root.unmount()); globalThis.IS_REACT_ACT_ENVIRONMENT = original.act; globalThis.fetch = original.fetch; console.error = original.error; });
  const session = Object.freeze({ id: 'same-reading', question: 'My interview tomorrow', cards: Object.freeze([17]) });
  const before = JSON.stringify(session);
  await act(async () => { root = create(createElement(CreditPaywall, { catalog: { settings: {}, products: [{ id: 'changed', title_en: 'Two perspectives', title_vi: 'Hai góc nhìn', price_vnd: 41000, credits: 2, active: true, kind: 'credits' }] }, loading: false, unavailable: false, onClose: () => actions.push('dismiss'), onPricing: () => actions.push('remember-reading-route') })); });
  assert.match(JSON.stringify(root.toJSON()), /Two perspectives/);
  assert.match(JSON.stringify(root.toJSON()), /41,000/);
  assert.deepEqual(actions, []);
  await act(async () => root.root.findByProps({ className: 'text-button credit-paywall-dismiss' }).props.onClick());
  const pricing = root.root.findByProps({ href: '#pricing' });
  await act(async () => pricing.props.onClick({ currentTarget: { closest: () => ({ close: () => actions.push('close-dialog') }) } }));
  assert.deepEqual(actions, ['dismiss', 'close-dialog', 'remember-reading-route']);
  assert.equal(JSON.stringify(session), before);
});
