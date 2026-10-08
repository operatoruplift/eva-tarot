import test from 'node:test';
import assert from 'node:assert/strict';
import { routeHash, readRoute, legacyPathHash } from '../src/lib/routes.ts';

test('saved conversation hashes resolve after the journal is loaded', () => {
  const id = 'cccafb19-74c0-4f1a-ab6a-f54f318561e2';
  const hash = routeHash('chat', id);
  assert.equal(hash, `#reading/${id}`);
  assert.deepEqual(readRoute(hash, [{ id }]), { view: 'chat', sessionId: id });
  assert.deepEqual(readRoute(hash, []), { view: 'missing', reason: 'missing' });
});

test('imported IDs round-trip as one whole encoded segment', () => {
  for (const id of ['saved/one', 'space in id', '100% complete', 'saved%2Fone', 'bài đọc/一', 'id#fragment?query']) {
    const sessions = [{ id }];
    assert.deepEqual(readRoute(routeHash('chat', id), sessions), { view: 'chat', sessionId: id });
  }
});

test('existing raw slash and percent links still find the complete saved ID', () => {
  for (const id of ['saved/one/two', '100% complete', 'saved%2Fone']) {
    assert.deepEqual(readRoute(`#reading/${id}`, [{ id }]), { view: 'chat', sessionId: id });
  }
  assert.deepEqual(readRoute('#reading/saved/one', [{ id: 'saved' }]), { view: 'missing', reason: 'missing' });
});

test('invalid or unavailable links give a recovery state without throwing or changing records', () => {
  const sessions = Object.freeze([Object.freeze({ id: 'keep-this-reading' })]);
  for (const hash of ['#reading', '#reading/', '#reading/%E0%A4%A', '#unknown', '#chat/stray']) {
    assert.deepEqual(readRoute(hash, sessions), { view: 'missing', reason: 'invalid' });
  }
  assert.deepEqual(readRoute('#reading/not-on-this-device', sessions), { view: 'missing', reason: 'missing' });
  assert.deepEqual(readRoute(routeHash('chat', '\ud800'), sessions), { view: 'missing', reason: 'invalid' });
  assert.deepEqual(sessions, [{ id: 'keep-this-reading' }]);
});

test('normal views and new chat keep their established routes', () => {
  for (const [view, hash] of [['home', '#chat'], ['calendar', '#calendar'], ['journal', '#journal'], ['learn', '#cards'], ['breathe', '#breathe'], ['rituals', '#rituals']]) {
    assert.equal(routeHash(view), hash);
    assert.deepEqual(readRoute(hash, []), { view });
  }
  assert.equal(routeHash('chat'), '#chat');
  assert.deepEqual(readRoute('', []), { view: 'home' });
});

test('legacy page paths canonicalize without claiming API or asset paths', () => {
  assert.equal(legacyPathHash('/reading/saved%2Fone'), '#reading/saved%2Fone');
  assert.equal(legacyPathHash('/reading/saved/one'), '#reading/saved/one');
  assert.equal(legacyPathHash('/reading'), '#reading');
  assert.equal(legacyPathHash('/calendar/'), '#calendar');
  assert.equal(legacyPathHash('/chat'), '#chat');
  for (const path of ['/', '/api/reading', '/api/health', '/assets/index.js', '/cards/the-fool.jpg', '/sw.js', '/not-a-page']) {
    assert.equal(legacyPathHash(path), null);
  }
});
