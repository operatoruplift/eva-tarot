import test from 'node:test';
import assert from 'node:assert/strict';
import { readReaderReturn, rememberReaderReturn, validReaderReturnHash } from '../src/lib/reader-return.ts';
const memory=()=>{const entries=new Map();return {entries,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};};

test('pricing page reload recovers only the previously selected internal reader route',()=>{
 const storage=memory();
 assert.equal(readReaderReturn(storage),'#chat');
 const reading='#reading/cccafb19-74c0-4f1a-ab6a-f54f318561e2';
 assert.equal(rememberReaderReturn(reading,storage),true);
 assert.equal(readReaderReturn(storage),reading);
 // Returning changes only the location: no provider, wallet or reading submission is involved.
 assert.equal(rememberReaderReturn('#pricing',storage),false);
 assert.equal(readReaderReturn(storage),reading);
 assert.equal(rememberReaderReturn('#chat',storage),true);
 assert.equal(readReaderReturn(storage),'#chat');
});
test('external locations, auth tokens, transfer handshakes and malformed stored values are not return targets',()=>{
 for(const value of ['https://example.com/#reading/one','javascript:alert(1)','#admin','#pricing','#access_token=secret','#error=denied','#transfer/private-nonce','#reading/','#reading/one?token=secret','#reading/a\nb','#reading/'+ 'a'.repeat(513),null,{}]){
  assert.equal(validReaderReturnHash(value),null);
  const storage=memory(); storage.getItem=()=>value;
  assert.equal(readReaderReturn(storage),'#chat');
 }
 for(const hash of ['#calendar','#journal','#breathe','#cards','#rituals','#reading/saved%2Fone','#reading/b%C3%A0i%20%C4%91%E1%BB%8Dc'])assert.equal(validReaderReturnHash(hash),hash);
});
test('blocked storage leaves normal navigation usable and does not claim a saved return target',()=>{
 const blocked={getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}};
 assert.equal(readReaderReturn(blocked),'#chat');
 assert.equal(rememberReaderReturn('#reading/safe',blocked),false);
});
