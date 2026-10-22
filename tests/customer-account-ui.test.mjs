import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import { CONNECTION_KEY } from '../src/lib/account-connection.ts';
import { CUSTOMER_AUTH_STORAGE_KEY } from '../src/lib/customer-auth.ts';

const user = { id: 'b327c953-cde1-4a27-8f46-1b8c53b47ba8', email: 'eva@example.com' };
const identity = { user, accessToken: 'fixture.access-token.signature' };
const status = { linked: true, email: user.email, updatedAt: '2026-10-22T03:00:00.000Z' };
const capabilities = { commerceToken: 'a'.repeat(64), backupToken: 'b'.repeat(64) };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let moduleNumber = 0;

async function until(predicate) {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await act(async () => { await tick(); });
  }
  assert.fail('The expected account action did not start.');
}
async function component() {
  const source = await readFile(new URL('../src/components/CustomerAccount.tsx', import.meta.url), 'utf8');
  let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  output = output.replace(/import ['"][^'"]+\.css['"];?/g, '');
  output = output.replace(/from (['"])(react|react\/jsx-runtime|lucide-react)\1/g, (_all, _quote, dependency) => `from ${JSON.stringify(import.meta.resolve(dependency))}`);
  const authMock = `export const customerAuth = globalThis.__evaCustomerUiAuth; export const CUSTOMER_CODE_RESEND_SECONDS = 60; export const CUSTOMER_AUTH_STORAGE_KEY = ${JSON.stringify(CUSTOMER_AUTH_STORAGE_KEY)}; export class CustomerAccountError extends Error { constructor(code,message) { super(message); this.code=code; } } // ${moduleNumber++}`;
  const i18nMock = 'export const useLanguage = () => ({ language: "en", t: value => value });';
  output = output.replace(/from (['"])\.\.\/lib\/customer-auth\1/g, `from ${JSON.stringify('data:text/javascript;base64,' + Buffer.from(authMock).toString('base64'))}`);
  output = output.replace(/from (['"])\.\.\/lib\/i18n\1/g, `from ${JSON.stringify('data:text/javascript;base64,' + Buffer.from(i18nMock).toString('base64'))}`);
  output = output.replace(/from (['"])\.\.\/lib\/account-connection\1/g, `from ${JSON.stringify(import.meta.resolve('../src/lib/account-connection.ts'))}`);
  return (await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))).CustomerAccount;
}
async function harness(t, { auth = {}, onLink = async () => {}, onRestore = async () => {}, onDisconnect = async () => {}, onSignOutError } = {}) {
  const previous = { window: globalThis.window, storage: globalThis.localStorage, auth: globalThis.__evaCustomerUiAuth, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const values = new Map(); const calls = { restore: 0, link: 0, signOut: [] };
  globalThis.window = new EventTarget();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__evaCustomerUiAuth = {
    available: true, currentIdentity: async () => identity, status: async () => status,
    restore: async () => { calls.restore++; return { ...status, ...capabilities }; },
    signOut: async expectedId => { calls.signOut.push(expectedId); }, ...auth,
  };
  const CustomerAccount = await component(); let renderer;
  await act(async () => {
    renderer = create(createElement(CustomerAccount, { beforeSwitch: async () => {}, onLink, onRestore, onDisconnect, onSignOutError }));
  });
  const unmount = async () => { if (renderer) { await act(async () => renderer.unmount()); renderer = undefined; } };
  t.after(async () => {
    await unmount(); globalThis.window = previous.window; globalThis.localStorage = previous.storage;
    globalThis.__evaCustomerUiAuth = previous.auth; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  });
  return {
    values, calls, unmount,
    get root() { return renderer.root; },
    async click(label) {
      const button = renderer.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.includes(label)));
      assert.ok(button, `Missing button: ${label}`);
      await act(async () => { button.props.onClick(); await tick(); });
    },
  };
}

for (const change of ['unmount', 'storage event', 'record change without event']) {
  test(`a deferred restore cannot mutate account scope after ${change}`, async t => {
    const pending = deferred(); let started = false; let activations = 0;
    const app = await harness(t, { auth: { restore: async () => { started = true; return pending.promise; } }, onRestore: async () => { activations++; } });
    await app.click('Restore my saved account'); await until(() => started);
    if (change === 'unmount') await app.unmount();
    else {
      app.values.set(CONNECTION_KEY, JSON.stringify({ version: 1, account: null, guest: { scope: null, commerceToken: 'c'.repeat(64), backupToken: null, backupEnabled: false } }));
      if (change === 'storage event') {
        const event = new Event('storage'); Object.defineProperty(event, 'key', { value: CONNECTION_KEY });
        await act(async () => window.dispatchEvent(event));
      }
    }
    await act(async () => { pending.resolve({ ...status, ...capabilities }); await tick(); });
    assert.equal(activations, 0);
  });
}

test('a different Auth identity cannot activate an earlier deferred restore', async t => {
  const pending = deferred(); let started = false; let activations = 0; let current = identity;
  const app = await harness(t, { auth: { currentIdentity: async () => current, restore: async () => { started = true; return pending.promise; } }, onRestore: async () => { activations++; } });
  await app.click('Restore my saved account'); await until(() => started);
  current = { user: { id: 'b327c953-cde1-4a27-8f46-1b8c53b47ba9', email: 'other@example.com' }, accessToken: 'fixture.other-token.signature' };
  await act(async () => { pending.resolve({ ...status, ...capabilities }); await tick(); });
  assert.equal(activations, 0);
});

test('closing the account panel aborts an already-running parent link callback', async t => {
  const pending = deferred(); let signal; let activations = 0;
  const app = await harness(t, {
    auth: { status: async () => ({ ...status, linked: false, updatedAt: null }) },
    onLink: async (_user, _token, operationSignal) => { signal = operationSignal; await pending.promise; if (!signal.aborted) activations++; },
  });
  await act(async () => app.root.findByType('input').props.onChange({ target: { checked: true } }));
  await app.click('Save this device to my account'); await until(() => signal !== undefined);
  assert.equal(signal.aborted, false); await app.unmount(); assert.equal(signal.aborted, true);
  await act(async () => { pending.resolve(); await tick(); }); assert.equal(activations, 0);
});

test('intentional disconnect still finishes signout for the starting identity after remount', async t => {
  let app;
  app = await harness(t, { onDisconnect: async () => { await app.unmount(); } });
  await app.click('Sign out on this device');
  assert.deepEqual(app.calls.signOut, [user.id]);
});

test('a signout failure remains visible to the stable parent after the account panel remount', async t => {
  const messages = []; let app;
  app = await harness(t, {
    auth: { signOut: async () => { throw new Error('private provider token must not leak'); } },
    onDisconnect: async () => { await app.unmount(); },
    onSignOutError: message => messages.push(message),
  });
  await app.click('Sign out on this device');
  assert.deepEqual(messages, ['This device is disconnected, but sign-out did not finish. We could not finish signing out. Keep this screen open and try again.']);
  assert.ok(messages.every(message => !/private|provider|token/.test(message)));
});

test('a cross-tab customer Auth change aborts an already-running parent link callback', async t => {
  const pending = deferred(); let signal; let activations = 0;
  const app = await harness(t, {
    auth: { status: async () => ({ ...status, linked: false, updatedAt: null }) },
    onLink: async (_user, _token, operationSignal) => { signal = operationSignal; await pending.promise; if (!signal.aborted) activations++; },
  });
  await act(async () => app.root.findByType('input').props.onChange({ target: { checked: true } }));
  await app.click('Save this device to my account'); await until(() => signal !== undefined);
  const event = new Event('storage'); Object.defineProperty(event, 'key', { value: CUSTOMER_AUTH_STORAGE_KEY });
  await act(async () => window.dispatchEvent(event)); assert.equal(signal.aborted, true);
  await act(async () => { pending.resolve(); await tick(); }); assert.equal(activations, 0);
});
