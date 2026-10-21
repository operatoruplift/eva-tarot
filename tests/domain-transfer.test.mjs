import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/DomainTransfer.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const language = `data:text/javascript;base64,${Buffer.from('export function useLanguage(){return {t:source=>source};}').toString('base64')}`;
const rewritten = compiled.replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(name.endsWith('/i18n') ? language : name.startsWith('.') ? new URL(`../src/components/${name}.ts`, import.meta.url).href : import.meta.resolve(name))}`);
const { DomainTransfer, readTransferWallet, saveTransferWallet, TRANSFER_DESTINATION_ORIGIN, TRANSFER_SOURCE_ORIGINS } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
const nonce = '12345678-1234-4234-8234-123456789012';
const token = 'a'.repeat(64);
const otherToken = 'b'.repeat(64);
const key = 'eva-commerce-device';
const data = { profile: { name: 'Linh', onboarded: true }, sessions: [], practiceDays: [], dayNotes: { '2026-10-21': 'A quiet afternoon.' } };
const payload = JSON.stringify({ format: 'evara-personal-data', version: 2, ...data, language: 'vi' });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function memoryStorage(values = new Map()) { return { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), values }; }
function emit(target, { origin = TRANSFER_SOURCE_ORIGINS[0], source: sender = target.opener, body = {} } = {}) {
  const event = new Event('message');
  Object.assign(event, { origin, source: sender, data: { type: 'eva-transfer-data', nonce, payload, wallet: { state: 'present', token }, ...body } });
  target.dispatchEvent(event);
}
async function harness(t, { origin = TRANSFER_DESTINATION_ORIGIN, storage = memoryStorage(), onImport = async () => {}, saved = true, opener = { messages: [], postMessage(...args) { this.messages.push(args); } }, hash = `#transfer/${nonce}` } = {}) {
  const previous = { window: globalThis.window, storage: globalThis.localStorage, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const browser = new EventTarget();
  Object.assign(browser, { location: { origin, hash }, opener });
  globalThis.window = browser;
  globalThis.localStorage = storage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let root;
  const props = { data, language: 'en', saved, onImport };
  await act(async () => { root = create(createElement(DomainTransfer, props)); });
  t.after(async () => { await act(async () => root.unmount()); globalThis.window = previous.window; globalThis.localStorage = previous.storage; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act; });
  return { root, browser, storage, opener, async update(next) { Object.assign(props, next); await act(async () => root.update(createElement(DomainTransfer, props))); } };
}

test('wallet transfer never creates a source wallet and rejects unreadable secrets', () => {
  const storage = memoryStorage();
  assert.deepEqual(readTransferWallet(storage), { state: 'none' });
  assert.equal(storage.values.size, 0);
  storage.values.set(key, token);
  assert.deepEqual(readTransferWallet(storage), { state: 'present', token });
  storage.values.set(key, 'not-a-wallet');
  assert.deepEqual(readTransferWallet(storage), { state: 'unavailable' });
  assert.deepEqual(readTransferWallet({ getItem() { throw new Error('Blocked'); } }), { state: 'unavailable' });
});

test('wallet import requires storage readback and preserves different destination wallets', () => {
  const storage = memoryStorage();
  assert.equal(saveTransferWallet({ state: 'present', token }, storage), 'copied');
  assert.equal(storage.getItem(key), token);
  assert.equal(saveTransferWallet({ state: 'present', token }, storage), 'unchanged');
  assert.equal(saveTransferWallet({ state: 'present', token: otherToken }, storage), 'conflict');
  assert.equal(storage.getItem(key), token);
  assert.equal(saveTransferWallet({ state: 'present', token }, { getItem: () => null, setItem() {} }), 'unavailable');
  assert.equal(saveTransferWallet({ state: 'present', token: 'bad' }, storage), 'unavailable');
  assert.equal(saveTransferWallet({ state: 'none' }, storage), 'not_present');
});

test('destination accepts only exact allowed origins, its opener, matching nonce and a valid envelope', async t => {
  let imports = 0;
  const app = await harness(t, { onImport: async () => { imports++; } });
  for (const options of [
    { origin: 'https://evatarot.vercel.app.attacker.example' },
    { origin: 'https://eevatarot.xyz' },
    { source: {} },
    { body: { nonce: 'different' } },
    { body: { payload: '{"broken":true}' } },
    { body: { wallet: { state: 'present', token: 'bad' } } },
  ]) await act(async () => { emit(app.browser, options); await tick(); });
  assert.equal(imports, 0);
  assert.equal(app.storage.getItem(key), null);
  assert.equal(app.opener.messages.filter(([body]) => body.type === 'eva-transfer-done').length, 0);
});

for (const origin of TRANSFER_SOURCE_ORIGINS) test(`durable journal and wallet copy is acknowledged to ${origin} only after saving`, async t => {
  const save = deferred();
  let imported;
  const app = await harness(t, { saved: false, onImport: value => { imported = value; return save.promise; } });
  await act(async () => { emit(app.browser, { origin }); await tick(); });
  assert.equal(imported.dayNotes['2026-10-21'], 'A quiet afternoon.');
  assert.equal(app.storage.getItem(key), null, 'wallet must not precede the durable journal');
  await act(async () => { save.resolve(); await tick(); });
  assert.equal(app.storage.getItem(key), token);
  assert.equal(app.opener.messages.filter(([body]) => body.type === 'eva-transfer-done').length, 0);
  await app.update({ saved: true });
  assert.deepEqual(app.opener.messages.filter(([body]) => body.type === 'eva-transfer-done'), [[{ type: 'eva-transfer-done', nonce, journal: 'saved', wallet: 'copied' }, origin]]);
  assert.match(JSON.stringify(app.root.toJSON()), /readings are saved at the new address/);
});

test('failed journal persistence cannot copy a wallet or acknowledge success', async t => {
  const app = await harness(t, { onImport: async () => { throw new Error('disk full'); } });
  await act(async () => { emit(app.browser); await tick(); });
  assert.equal(app.storage.getItem(key), null);
  assert.equal(app.opener.messages.filter(([body]) => body.type === 'eva-transfer-done').length, 0);
  assert.match(JSON.stringify(app.root.toJSON()), /copy could not be confirmed/);
});

test('a destination wallet conflict preserves both identities and reports a partial copy', async t => {
  const storage = memoryStorage(new Map([[key, otherToken]]));
  const app = await harness(t, { storage });
  await act(async () => { emit(app.browser); await tick(); });
  assert.equal(storage.getItem(key), otherToken);
  assert.equal(app.opener.messages.at(-1)[0].wallet, 'conflict');
  assert.match(JSON.stringify(app.root.toJSON()), /previous wallet and its credits remain at the old address/);
});

test('blocked wallet storage still reports the saved journal honestly', async t => {
  const app = await harness(t, { storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  await act(async () => { emit(app.browser); await tick(); });
  assert.equal(app.opener.messages.at(-1)[0].journal, 'saved');
  assert.equal(app.opener.messages.at(-1)[0].wallet, 'unavailable');
  assert.match(JSON.stringify(app.root.toJSON()), /wallet could not be copied/);
});

test('source opens only the canonical destination after a click and transfers no secret in its URL', async t => {
  const oldStorage = memoryStorage(new Map([[key, token]]));
  const app = await harness(t, { origin: TRANSFER_SOURCE_ORIGINS[0], storage: oldStorage, opener: null, hash: '#chat' });
  const destination = { messages: [], postMessage(...args) { this.messages.push(args); } };
  const opened = [];
  app.browser.open = (...args) => { opened.push(args); return destination; };
  assert.equal(opened.length, 0, 'there is no automatic redirect or popup');
  await act(async () => app.root.root.findByType('button').props.onClick());
  const transferNonce = new URL(opened[0][0]).hash.split('/')[1];
  assert.equal(new URL(opened[0][0]).origin, TRANSFER_DESTINATION_ORIGIN);
  assert.doesNotMatch(opened[0][0], new RegExp(token));
  await act(async () => { emit(app.browser, { origin: 'https://untrusted.example', source: destination, body: { type: 'eva-transfer-ready', nonce: transferNonce } }); await tick(); });
  assert.equal(destination.messages.length, 0);
  await act(async () => { emit(app.browser, { origin: TRANSFER_DESTINATION_ORIGIN, source: destination, body: { type: 'eva-transfer-ready', nonce: transferNonce } }); await tick(); });
  assert.equal(destination.messages.length, 1);
  assert.equal(destination.messages[0][1], TRANSFER_DESTINATION_ORIGIN);
  assert.equal(destination.messages[0][0].wallet.token, token);
  assert.equal(oldStorage.getItem(key), token, 'the source wallet remains usable');
  await act(async () => { emit(app.browser, { origin: TRANSFER_DESTINATION_ORIGIN, source: destination, body: { type: 'eva-transfer-done', nonce: transferNonce, journal: 'saved', wallet: 'conflict' } }); await tick(); });
  assert.match(JSON.stringify(app.root.toJSON()), /different wallet/);
});

test('a transfer-looking URL on an unrelated origin cannot receive or send a journal', async t => {
  let imports = 0;
  const app = await harness(t, { origin: 'https://untrusted.example', onImport: async () => { imports++; } });
  await act(async () => { emit(app.browser); await tick(); });
  assert.equal(imports, 0);
  assert.equal(app.opener.messages.length, 0);
  assert.equal(app.root.toJSON(), null);
});
