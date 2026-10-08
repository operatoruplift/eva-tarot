import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Load the real JSX module with Node's TypeScript support for its data imports.
const source = await readFile(new URL('../src/lib/i18n.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const rewritten = compiled.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
  const url = specifier.startsWith('.') ? new URL(`../src/lib/${specifier}.ts`, import.meta.url).href : import.meta.resolve(specifier);
  return `from ${JSON.stringify(url)}`;
});
const { translate } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);

test('translation safely preserves arbitrary imported labels and still substitutes placeholders', () => {
  for (const language of ['en', 'vi', 'es']) {
    for (const label of ['constructor', '__proto__', 'toString', 'My personal focus']) {
      assert.equal(translate(language, label), label);
    }
  }
  assert.equal(translate('en', 'Hello {name}', { name: 'Linh' }), 'Hello Linh');
  assert.equal(translate('vi', 'Your present situation'), 'Tình hình hiện tại');
});
