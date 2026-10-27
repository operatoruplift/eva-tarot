import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function escapeRegExp(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  const body = glob.split('**').map(part => part.split('*').map(escapeRegExp).join('[^/]*')).join('.*');
  return new RegExp(`^${body}$`);
}

function expandGlobs(value) {
  if (value.startsWith('{') && value.endsWith('}')) return value.slice(1, -1).split(',');
  return [value];
}

function matchesGlob(glob, filePath) {
  return expandGlobs(glob).some(pattern => globToRegExp(pattern).test(filePath));
}

function gitignoreRegExp(pattern) {
  let body = pattern;
  const anchored = body.startsWith('/');
  if (anchored) body = body.slice(1);
  if (body.endsWith('/')) body = body.slice(0, -1);
  const hasSlash = body.includes('/');
  body = body.split('**').map(part => part.split('*').map(escapeRegExp).join('[^/]*')).join('.*');
  const prefix = hasSlash || anchored ? '^' : '(?:^|.*/)';
  return new RegExp(`${prefix}${body}(?:/.*)?$`);
}

function vercelIgnored(lines, filePath) {
  let ignored = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const negated = trimmed.startsWith('!');
    const pattern = negated ? trimmed.slice(1) : trimmed;
    if (!gitignoreRegExp(pattern).test(filePath)) continue;
    ignored = !negated;
  }
  return ignored;
}

function runtimeRelativeSpecifiers(source) {
  return source.split('\n').flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('import type ') || trimmed.startsWith('export type ')) return [];
    const from = trimmed.match(/^(?:import|export)\b[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/);
    const bare = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
    const specifier = from?.[1] ?? bare?.[1];
    return specifier?.startsWith('.') ? [specifier] : [];
  });
}

async function apiEntrypoints() {
  const files = [];
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(resolve(directory, entry.name), rel);
      else if (entry.name.endsWith('.mjs')) files.push(`api/${rel}`);
    }
  }
  await walk(resolve(root, 'api'), '');
  return files.sort();
}

async function runtimeTypeScript(entry) {
  const seen = new Set();
  const files = new Set();
  async function walk(file) {
    const absolute = resolve(root, file);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    const source = await readFile(absolute, 'utf8');
    for (const specifier of runtimeRelativeSpecifiers(source)) {
      if (!specifier.endsWith('.mjs') && !specifier.endsWith('.ts')) {
        throw new Error(`${file} imports ${specifier} without a .mjs or .ts runtime extension`);
      }
      const next = relative(root, resolve(dirname(absolute), specifier)).split('\\').join('/');
      if (specifier.endsWith('.ts')) files.add(next);
      await walk(next);
    }
  }
  await walk(entry);
  return [...files].sort();
}

test('serverless handlers include every TypeScript file they import, including the commerce function', async () => {
  const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
  const ignoreLines = (await readFile(resolve(root, '.vercelignore'), 'utf8')).split('\n');
  const entries = await apiEntrypoints();
  assert.deepEqual(entries, ['api/commerce.mjs', 'api/health.mjs', 'api/payments/webhook.mjs', 'api/reading.mjs']);

  const patterns = Object.keys(config.functions);
  const includeFiles = new Set(patterns.map(pattern => config.functions[pattern].includeFiles));
  assert.deepEqual([...includeFiles], ['{src/data/**,src/lib/public-catalog.ts,src/lib/vietqr.ts,src/lib/commerce.ts,supabase/functions/commerce/index.ts}']);
  assert.ok(ignoreLines.every(line => line.trim() !== 'supabase'));

  for (const entry of entries) {
    const matches = patterns.filter(pattern => matchesGlob(pattern, entry));
    assert.deepEqual(matches, [entry.startsWith('api/payments/') ? 'api/payments/*.mjs' : 'api/*.mjs']);
    assert.equal(config.functions[matches[0]].maxDuration, 90);
    const imported = await runtimeTypeScript(entry);
    assert.ok(imported.includes('supabase/functions/commerce/index.ts'));
    assert.ok(imported.includes('src/lib/public-catalog.ts'));
    assert.ok(imported.includes('src/lib/vietqr.ts'));
    for (const file of imported) {
      assert.equal(matchesGlob(config.functions[matches[0]].includeFiles, file), true, `${entry} needs ${file} in includeFiles`);
      assert.equal(vercelIgnored(ignoreLines, file), false, `${file} is excluded by .vercelignore`);
    }
  }

  for (const excluded of [
    'supabase/migrations/20261027140000_open_vietqr_checkout.sql',
    'supabase/schema.sql',
    'supabase/commerce-schema.sql',
    'supabase/templates/magic-link.html',
    'supabase/functions/journal/index.ts',
    'supabase/functions/customer-account/index.ts',
  ]) {
    assert.equal(vercelIgnored(ignoreLines, excluded), true, excluded);
  }
});
