import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTION_KEY, guestFromBrowser, nextAccountConnection, personalScope, persistConnection, prepareLinkBackupToken, readConnection } from '../src/lib/account-connection.ts';

const id = 'd4f52768-01cb-46bb-a5d2-eeb2b6f36945';
const other = '89d9121e-dc3a-47b2-9498-94bd76fc3f5e';
const guest = { scope: null, commerceToken: 'a'.repeat(64), backupToken: 'b'.repeat(64), backupEnabled: true };
const account = { userId: id, email: 'customer@example.test', commerceToken: guest.commerceToken, backupToken: guest.backupToken, backupEnabled: true };
function store(initial = []) { const values = new Map(initial); return { values, getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) }; }

test('first account link keeps original capabilities but signs out into a separate blank guest scope', () => {
  const state = nextAccountConnection(guest,account,true,()=>'c'.repeat(64),()=>other);
  assert.equal(state.account.commerceToken,guest.commerceToken);
  assert.equal(state.account.backupToken,guest.backupToken);
  assert.equal(personalScope(state),`account-${id}`);
  assert.equal(personalScope({...state,account:null}),other);
  assert.notEqual(state.guest.commerceToken,account.commerceToken);
  assert.equal(state.guest.backupToken,null);
  assert.equal(state.guest.backupEnabled,false);
});

test('restoring another device account preserves its separate guest wallet without summing balances', () => {
  const existingGuest = {...guest,scope:other};
  const restored = {...account,commerceToken:'d'.repeat(64)};
  const state = nextAccountConnection(existingGuest,restored,false,()=>assert.fail(),()=>assert.fail());
  assert.deepEqual(state.guest,existingGuest);
  assert.equal(state.account.commerceToken,'d'.repeat(64));
  assert.equal(personalScope({...state,account:null}),other);
});

test('one durable connection record survives reload; blocked or corrupt storage does not silently select the legacy journal', () => {
  const memory = store();
  assert.equal(readConnection(memory),null);
  const state = {version:1,guest,account};
  persistConnection(state,memory);
  assert.deepEqual(readConnection(memory),state);
  const damaged = store([[CONNECTION_KEY,'broken']]);
  assert.throws(()=>readConnection(damaged),/could not be read/);
  assert.throws(()=>persistConnection(state,{getItem:()=>null,setItem:()=>{}}),/could not save/);
  assert.equal(damaged.values.get(CONNECTION_KEY),'broken');
});

test('legacy guest capture does not include personal data and recovers only valid backup capabilities', () => {
  const memory = store([['evara-private-backup-token',guest.backupToken],['evara-private-backup-enabled','true']]);
  assert.deepEqual(guestFromBrowser(guest.commerceToken,memory),guest);
  memory.setItem('evara-private-backup-token','not-a-secret');
  assert.equal(guestFromBrowser(guest.commerceToken,memory).backupToken,null);
  assert.throws(()=>nextAccountConnection(guest,{...account,userId:'../legacy'},true,()=>'',()=>''),/could not be read/);
});

test('link A, sign out, then link B stages an independent retry-stable backup token without enabling uploads', () => {
  const memory=store([['evara-private-backup-token',guest.backupToken]]);
  const linked=nextAccountConnection(guest,account,true,()=>'c'.repeat(64),()=>other);
  persistConnection(linked,memory);
  assert.throws(()=>prepareLinkBackupToken(()=>'d'.repeat(64),memory),/Sign out/);
  persistConnection({...linked,account:null},memory);
  const next=prepareLinkBackupToken(()=>'d'.repeat(64),memory);
  assert.notEqual(next,account.backupToken);
  assert.equal(next,'d'.repeat(64));
  assert.equal(prepareLinkBackupToken(()=>assert.fail('retry must not regenerate'),memory),next);
  assert.equal(readConnection(memory).guest.backupEnabled,false);
  assert.equal(memory.getItem('evara-private-backup-token'),account.backupToken);
});
