import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireLocalReaderLease, LOCAL_AI_GPU_ERROR, LOCAL_AI_OTHER_TAB_ERROR, LOCAL_AI_STORAGE_ERROR, localReaderFailureMessage, localReaderRequiredBytes, prepareLocalReaderStorage } from '../src/lib/local-ai-safety.ts';

test('uncached downloads reserve journal space, while cached readers remain loadable', async () => {
  let persistenceRequests = 0;
  const storage = {
    persist: async () => { persistenceRequests++; return false; },
    estimate: async () => ({ usage: 100, quota: 100 + localReaderRequiredBytes(984) - 1 }),
  };
  await assert.rejects(prepareLocalReaderStorage(984, false, storage), { message: LOCAL_AI_STORAGE_ERROR });
  await prepareLocalReaderStorage(984, true, storage);
  assert.equal(persistenceRequests, 2);
  await prepareLocalReaderStorage(360, false, storage);
});

test('denied persistence and unavailable storage estimates do not block a load', async () => {
  await prepareLocalReaderStorage(984, false, {
    persist: async () => { throw new Error('Permission denied'); },
    estimate: async () => ({ usage: 0, quota: localReaderRequiredBytes(984) }),
  });
  await prepareLocalReaderStorage(984, null, {
    persist: async () => false,
    estimate: async () => { throw new Error('Unavailable'); },
  });
  await prepareLocalReaderStorage(984, false);
});

test('quota and GPU errors from string worker messages become useful safe messages', () => {
  assert.equal(localReaderFailureMessage('QuotaExceededError: secret file name', 'fallback'), LOCAL_AI_STORAGE_ERROR);
  assert.equal(localReaderFailureMessage('The WebGPU device was lost while loading secret content', 'fallback'), LOCAL_AI_GPU_ERROR);
  assert.equal(localReaderFailureMessage(new Error('out of memory: private data'), 'fallback'), LOCAL_AI_GPU_ERROR);
  assert.equal(localReaderFailureMessage('unknown error containing private data', 'fallback'), 'fallback');
});

function fakeLocks() {
  let held = false;
  const requests = [];
  return {
    requests,
    get held() { return held; },
    async request(name, options, callback) {
      requests.push({ name, options });
      if (held) return callback(null);
      held = true;
      try { return await callback({ name }); } finally { held = false; }
    },
  };
}

test('reader lease rejects a second tab immediately and releases on disposal or abort', async () => {
  const locks = fakeLocks();
  const release = await acquireLocalReaderLease(new AbortController().signal, locks);
  assert.equal(locks.held, true);
  await assert.rejects(acquireLocalReaderLease(new AbortController().signal, locks), { message: LOCAL_AI_OTHER_TAB_ERROR });
  assert.equal(locks.requests[1].options.ifAvailable, true);
  release();
  await new Promise(resolve => setImmediate(resolve));
  const controller = new AbortController();
  await acquireLocalReaderLease(controller.signal, locks);
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(locks.held, false);
  await acquireLocalReaderLease(new AbortController().signal, { request: async () => { throw new Error('Unavailable'); } });
});

test('loader blocks the worker before a low-space download and disposes a ready worker on pagehide', async () => {
  const originals = new Map(['navigator', 'Worker', 'window', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const windowEvents = new EventTarget();
  const locks = fakeLocks();
  let quota = 1;
  let persistCalls = 0;
  let fetchCalls = 0;
  const workers = [];
  class FakeWorker {
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(message) {
      if (message.kind === 'reload') queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: { kind: 'return', uuid: message.uuid, content: null } })));
    }
    terminate() { this.terminated = true; }
  }
  const globals = {
    window: windowEvents,
    navigator: {
      gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) },
      storage: { persist: async () => { persistCalls++; return false; }, estimate: async () => ({ usage: 0, quota }) },
      locks,
    },
    Worker: FakeWorker,
    fetch: async () => { fetchCalls++; throw new Error('No actual model or user data requests allowed'); },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let reader;
  try {
    reader = await import('../src/lib/local-ai.ts?synthetic-safe-load-test');
    await assert.rejects(reader.enableLocalAI(), { message: LOCAL_AI_STORAGE_ERROR });
    assert.equal(workers.length, 0);
    assert.equal(fetchCalls, 0);
    quota = localReaderRequiredBytes(984);
    await reader.enableLocalAI();
    assert.equal(reader.getLocalAIState().status, 'ready');
    assert.equal(workers.length, 1);
    assert.equal(persistCalls, 2);
    assert.equal(locks.held, true);
    windowEvents.dispatchEvent(new Event('pagehide'));
    assert.equal(workers[0].terminated, true);
    assert.equal(reader.getLocalAIState().status, 'idle');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(locks.held, false);
    await reader.enableLocalAI();
    assert.equal(reader.getLocalAIState().status, 'ready');
    assert.equal(workers.length, 2);
    reader.disposeLocalAI();
    assert.equal(workers[1].terminated, true);
  } finally {
    reader?.disposeLocalAI();
    if (reader) windowEvents.removeEventListener('pagehide', reader.disposeLocalAI);
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
