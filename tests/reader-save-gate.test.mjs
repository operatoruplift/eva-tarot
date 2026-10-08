import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForReaderSave } from '../src/lib/reader-save-gate.ts';

test('stopping during a pending save prevents later AI startup without stopping the write', async () => {
  const controller = new AbortController();
  let commit;
  let started = false;
  let committed = false;
  const write = new Promise(resolve => { commit = () => { committed = true; resolve(); }; });
  const start = waitForReaderSave(() => write, controller.signal).then(() => { started = true; });
  controller.abort();
  await assert.rejects(start, { name: 'AbortError' });
  commit();
  await write;
  assert.equal(committed, true);
  assert.equal(started, false);
});

test('a failed save prevents reader startup and preserves the storage error', async () => {
  const failure = new Error('Quota exceeded');
  await assert.rejects(waitForReaderSave(() => Promise.reject(failure), new AbortController().signal), failure);
});
