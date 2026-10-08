import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

// Exercise the real boundary with simple presentation/translation dependencies.
const source = await readFile(new URL('../src/components/AppErrorBoundary.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const presentation = `data:text/javascript;base64,${Buffer.from('export function Logo(){return null;} export function useLanguage(){return {t:source=>source};}').toString('base64')}`;
const rewritten = compiled.replace(/import\s+["']\.\/RecoveryStates\.css["'];?/g, '').replace(/from ["']([^"']+)["']/g, (_, specifier) => {
  return `from ${JSON.stringify(specifier.startsWith('.') ? presentation : import.meta.resolve(specifier))}`;
});
const { AppErrorBoundary } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);

test('render failure offers usable recovery without exposing error text or clearing saved data', async t => {
  const original = { window: globalThis.window, localStorage: globalThis.localStorage, act: globalThis.IS_REACT_ACT_ENVIRONMENT, consoleError: console.error };
  const saved = new Map([['journal', 'saved conversation']]);
  const navigations = [];
  let reloads = 0;
  globalThis.window = { history: { replaceState: (...args) => navigations.push(args) }, location: { reload: () => { reloads++; } } };
  globalThis.localStorage = { getItem: key => saved.get(key), setItem: () => assert.fail('Recovery must not write storage'), clear: () => assert.fail('Recovery must not clear storage'), removeItem: () => assert.fail('Recovery must not delete storage') };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = () => {};
  let root;
  t.after(async () => {
    if (root) await act(async () => root.unmount());
    globalThis.window = original.window;
    globalThis.localStorage = original.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = original.act;
    console.error = original.consoleError;
  });
  function FailedScreen() { throw new Error('PRIVATE_JOURNAL_TEXT'); }
  await act(async () => { root = create(createElement(AppErrorBoundary, null, createElement(FailedScreen))); });
  const output = JSON.stringify(root.toJSON());
  assert.match(output, /Eva couldn’t open this screen/);
  assert.doesNotMatch(output, /PRIVATE_JOURNAL_TEXT/);
  const buttons = root.root.findAllByType('button');
  await act(async () => buttons[0].props.onClick());
  assert.equal(reloads, 1);
  assert.deepEqual(navigations, []);
  await act(async () => buttons[1].props.onClick());
  assert.equal(reloads, 2);
  assert.deepEqual(navigations, [[null, '', '/#chat']]);
  assert.equal(saved.get('journal'), 'saved conversation');
});
