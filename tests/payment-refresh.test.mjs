import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentRefresh } from '../src/lib/payment-refresh.ts';

async function settle() { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }
function clock() {
  let time = 0; let sequence = 0; const timers = new Map();
  return {
    now: () => time,
    schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { at: time + delay, callback }); return id; },
    cancel: id => timers.delete(id),
    get size() { return timers.size; },
    async advance(ms) {
      const until = time + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback(); await settle();
      }
      time = until; await settle();
    },
  };
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(load, options = {}) {
  const time = clock(); const values = []; const errors = []; const states = [];
  const controller = createPaymentRefresh({
    ...time, ...options, load,
    onData(value) { values.push(value); controller.setPending(value.pending); },
    onError(error) { errors.push(error); }, onState(state) { states.push(state); },
  });
  return { time, controller, values, errors, states, get state() { return states.at(-1); } };
}

test('pending payments refresh every fifteen seconds and terminal server status stops the timer', async () => {
  let calls = 0;
  const fixture = setup(async () => ({ pending: ++calls === 1, status: calls === 1 ? 'transfer_sent' : 'confirmed' }));
  await fixture.controller.refresh();
  assert.equal(calls, 1); assert.equal(fixture.state.phase, 'waiting'); assert.equal(fixture.time.size, 1);
  await fixture.time.advance(14_999); assert.equal(calls, 1);
  await fixture.time.advance(1); assert.equal(calls, 2);
  assert.equal(fixture.values.at(-1).status, 'confirmed'); assert.equal(fixture.state.phase, 'idle'); assert.equal(fixture.time.size, 0);
  await fixture.time.advance(300_000); assert.equal(calls, 2);
});

test('hidden and offline pages stop polling, and coming back from the bank refreshes immediately once', async () => {
  let calls = 0;
  const fixture = setup(async () => ({ pending: true, revision: ++calls }));
  await fixture.controller.refresh();
  fixture.controller.setEnvironment({ visible: false, online: true });
  assert.equal(fixture.state.phase, 'hidden'); assert.equal(fixture.time.size, 0);
  await fixture.time.advance(90_000); assert.equal(calls, 1);
  fixture.controller.setEnvironment({ visible: true, online: true });
  await fixture.controller.resume(); await settle();
  assert.equal(calls, 2); assert.equal(fixture.state.lastCheckedAt, 90_000);
  fixture.controller.setEnvironment({ visible: true, online: false });
  await fixture.controller.refresh(); await fixture.time.advance(90_000);
  assert.equal(calls, 2); assert.equal(fixture.state.phase, 'offline'); assert.equal(fixture.state.lastCheckedAt, 90_000);
  fixture.controller.setEnvironment({ visible: true, online: true }); await settle();
  assert.equal(calls, 3); assert.equal(fixture.state.phase, 'waiting');
  fixture.controller.stop();
});

test('wallet reads never overlap and an aborted hidden-page result cannot replace newer payment state', async () => {
  const first = deferred(); const second = deferred(); const signals = [];
  const fixture = setup(signal => { signals.push(signal); return signals.length === 1 ? first.promise : second.promise; });
  const original = fixture.controller.refresh(); const duplicate = fixture.controller.refresh();
  assert.equal(original, duplicate); await settle(); assert.equal(signals.length, 1);
  fixture.controller.setEnvironment({ visible: false, online: true });
  assert.equal(signals[0].aborted, true);
  fixture.controller.setEnvironment({ visible: true, online: true });
  const resumed = fixture.controller.resume(); await settle(); assert.equal(signals.length, 1);
  first.resolve({ pending: true, status: 'pending', revision: 'stale' });
  await original; await resumed; await settle();
  assert.equal(signals.length, 2); assert.deepEqual(fixture.values, []);
  second.resolve({ pending: false, status: 'confirmed', revision: 'current' }); await settle();
  assert.deepEqual(fixture.values, [{ pending: false, status: 'confirmed', revision: 'current' }]);
  assert.equal(fixture.state.phase, 'idle'); assert.equal(fixture.time.size, 0);
});

test('failed checks back off, stop after three failures, and preserve the last checked time until a successful manual retry', async () => {
  let calls = 0;
  const fixture = setup(async () => {
    calls += 1;
    if (calls >= 2 && calls <= 4) throw new Error('Server temporarily unavailable');
    return { pending: calls < 5, status: calls < 5 ? 'pending' : 'rejected' };
  });
  await fixture.controller.refresh();
  const lastSuccess = fixture.state.lastCheckedAt;
  await fixture.time.advance(15_000); assert.equal(calls, 2); assert.equal(fixture.state.phase, 'retrying');
  await fixture.time.advance(29_999); assert.equal(calls, 2);
  await fixture.time.advance(1); assert.equal(calls, 3);
  await fixture.time.advance(59_999); assert.equal(calls, 3);
  await fixture.time.advance(1); assert.equal(calls, 4); assert.equal(fixture.state.phase, 'paused');
  assert.equal(fixture.errors.length, 3); assert.equal(fixture.values.length, 1); assert.equal(fixture.state.lastCheckedAt, lastSuccess);
  await fixture.time.advance(600_000); assert.equal(calls, 4); assert.equal(fixture.time.size, 0);
  await fixture.controller.refresh(); assert.equal(calls, 5); assert.equal(fixture.state.phase, 'idle');
  assert.equal(fixture.values.at(-1).status, 'rejected'); assert.equal(fixture.state.lastCheckedAt, fixture.time.now());
});

test('a transfer mutation invalidates an older wallet poll and waits for a fresh serialized server response', async () => {
  const beforeTransfer = deferred(); const afterTransfer = deferred(); const signals = [];
  const fixture = setup(signal => { signals.push(signal); return signals.length === 1 ? beforeTransfer.promise : afterTransfer.promise; });
  const original = fixture.controller.refresh(); await settle();
  const afterChange = fixture.controller.refreshAfterChange();
  assert.equal(signals[0].aborted, true); assert.equal(signals.length, 1);
  beforeTransfer.resolve({ pending: true, status: 'pending' }); await original; await settle();
  assert.deepEqual(fixture.values, []); assert.equal(signals.length, 2);
  afterTransfer.resolve({ pending: true, status: 'transfer_sent' }); await afterChange;
  assert.deepEqual(fixture.values, [{ pending: true, status: 'transfer_sent' }]);
  assert.equal(fixture.state.phase, 'waiting'); fixture.controller.stop();
});

test('a long-open pending payment has a bounded check budget and manual refresh remains available', async () => {
  let calls = 0;
  const fixture = setup(async () => ({ pending: true, revision: ++calls }), { maxAutomaticChecks: 2 });
  await fixture.controller.refresh(); await fixture.time.advance(30_000);
  assert.equal(calls, 3); assert.equal(fixture.state.phase, 'paused'); assert.equal(fixture.time.size, 0);
  await fixture.time.advance(300_000); assert.equal(calls, 3);
  await fixture.controller.refresh(); assert.equal(calls, 4); assert.equal(fixture.state.phase, 'waiting');
  fixture.controller.stop(); await fixture.time.advance(300_000); assert.equal(calls, 4);
});

test('unmount aborts the active read and ignores its late success or failure', async () => {
  for (const fails of [false, true]) {
    const request = deferred(); let signal;
    const fixture = setup(current => { signal = current; return request.promise; });
    const done = fixture.controller.refresh(); await settle();
    fixture.controller.stop(); const stateCount = fixture.states.length;
    assert.equal(signal.aborted, true); assert.equal(fixture.time.size, 0);
    if (fails) request.reject(new Error('Too late')); else request.resolve({ pending: true });
    await done;
    assert.equal(fixture.states.length, stateCount); assert.deepEqual(fixture.values, []); assert.deepEqual(fixture.errors, []);
  }
});
