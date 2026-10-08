import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { IDBFactory } from 'fake-indexeddb';
import { createDataExport, parseDataImport, mergePersonalData, usePersistentData } from '../src/lib/persistence.ts';
import { validSessions } from '../src/lib/storage.ts';
import { approveOnlineSession, needsOnlineApproval, readOnlineApproval, saveOnlineApproval, withReaderIntent } from '../src/lib/reader-mode.ts';
import { reviseConversation } from '../src/lib/revisions.ts';
import { waitForReaderSave } from '../src/lib/reader-save-gate.ts';

const journal = sessions => ({profile:{name:'',onboarded:false},sessions,practiceDays:[],dayNotes:{}});
const chat = (id,date) => ({id,date,title:'Private question',focus:'Conversation',saved:false,note:'',drawCount:0,messages:[{id:`${id}-q`,role:'user',text:'This question is for the on-device reader.'}]});
async function until(predicate) {
  for(let attempt=0;attempt<100;attempt++) {if(predicate())return;await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});}
  assert.fail('Journal did not settle.');
}

test('a new private question after earlier online approval stays private after a pre-reply crash and reload', async t => {
  const originals={indexedDB:globalThis.indexedDB,localStorage:globalThis.localStorage,window:globalThis.window,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  const values=new Map();
  globalThis.indexedDB=new IDBFactory();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  globalThis.window=new EventTarget();globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let state,root;
  function Probe(){state=usePersistentData();return null;}
  const mount=async()=>{await act(async()=>{root=create(createElement(Probe));});await until(()=>state.isCurrentDataSaved);};
  t.after(async()=>{if(root)await act(async()=>root.unmount());globalThis.indexedDB=originals.indexedDB;globalThis.localStorage=originals.localStorage;globalThis.window=originals.window;globalThis.IS_REACT_ACT_ENVIRONMENT=originals.act;});
  await mount();
  const approved=approveOnlineSession(readOnlineApproval(),'prior-online');
  saveOnlineApproval(approved,globalThis.localStorage);
  const unanswered=withReaderIntent(chat('new-private',new Date(approved.firstAcceptedAt+1).toISOString()),'local');
  let gpuStarted=false;
  await act(async()=>{
    state.setSessions([unanswered]);
    void waitForReaderSave(state.flush,new AbortController().signal).then(()=>{gpuStarted=true;});
    assert.equal(gpuStarted,false);
  });
  await until(()=>gpuStarted);
  assert.equal(state.isCurrentDataSaved,true);
  // Simulate losing all in-memory reader mode and pending setup before any AI answer.
  await act(async()=>{root.unmount();root=undefined;});await mount();
  const restored=state.sessions[0];
  const remembered=readOnlineApproval(globalThis.localStorage);
  assert.equal(restored.messages.length,1);
  assert.equal(restored.messages[0].role,'user');
  assert.equal(restored.privateReader,true);
  assert.equal(needsOnlineApproval(remembered,restored),true);
  const explicit=approveOnlineSession(remembered,restored.id);
  assert.equal(needsOnlineApproval(explicit,restored),true,'old approvals cannot override new private intent');
  const shared=withReaderIntent(restored,'online');
  assert.equal(needsOnlineApproval(explicit,shared),false);
  saveOnlineApproval(explicit,globalThis.localStorage);
  await act(async()=>state.setSessions([shared]));await until(()=>state.isCurrentDataSaved);
  const privateAgain=withReaderIntent({...shared,messages:[...shared.messages,{id:'another-q',role:'user',text:'Keep this new question on my device.'}]},'local');
  await act(async()=>state.setSessions([privateAgain]));await until(()=>state.isCurrentDataSaved);
  await act(async()=>{root.unmount();root=undefined;});await mount();
  assert.equal(needsOnlineApproval(readOnlineApproval(globalThis.localStorage),state.sessions[0]),true,'switching an already-approved chat back to local requires fresh disclosure after reload');
});

test('private intent survives backup, revisions and other tabs, and only explicit choices clear it', () => {
  const session=withReaderIntent(chat('private','2026-10-10T00:00:00.000Z'),'local');
  assert.equal(validSessions([{...session,privateReader:'true'}]),false);
  assert.equal(parseDataImport(createDataExport(journal([session]))).sessions[0].privateReader,true);
  const revision=reviseConversation(session,'private-q','Updated private question','New version',{id:'revision',now:'2026-10-10T00:01:00.000Z',keepCards:false,count:0});
  assert.equal(revision.privateReader,true);
  const older=chat(session.id,session.date);
  const merged=mergePersonalData(journal([older]),journal([{...older,note:'Another tab’s note'}]),journal([session]));
  assert.equal(merged.sessions[0].privateReader,true);
  const simultaneous=mergePersonalData(journal([]),journal([older]),journal([session]));
  assert.equal(simultaneous.sessions[0].privateReader,true);
  const cleared=mergePersonalData(journal([session]),journal([withReaderIntent(session,'online')]),journal([session]));
  assert.equal(cleared.sessions[0].privateReader,false);
});

test('a future-dated imported legacy question cannot use dates as proof of online approval', () => {
  const approval=approveOnlineSession(readOnlineApproval(),'previous-online');
  const imported=parseDataImport(createDataExport(journal([chat('future-legacy','2099-01-01T00:00:00.000Z')]))).sessions[0];
  assert.equal(imported.privateReader,undefined);
  assert.equal(needsOnlineApproval(approval,imported),true);
  assert.equal(needsOnlineApproval(approveOnlineSession(approval,imported.id),imported),false);
  assert.equal(needsOnlineApproval(approval,withReaderIntent(chat('new-online','2000-01-01T00:00:00.000Z'),'online')),false,'Explicit online intent does not depend on device clock accuracy.');
});

test('editing a legacy unanswered private question preserves its disclosure requirement before immediate generation', async () => {
  // Execute the actual App revision handler with UI effects replaced by probes.
  // This catches the ordering bug where a new revision date looked like new online consent.
  const source=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  const syntax=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='revise')handler=node;ts.forEachChild(node,visit);}
  visit(syntax);assert.ok(handler,'The App revision handler must exist.');
  const code=ts.transpileModule(handler.getText(syntax),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [keepCards,count] of [[false,0],[true,3]]){
    const consentTime=Date.now()-10_000;
    const approval={allowed:true,firstAcceptedAt:consentTime,localSessions:['previous-online-chat']};
    const original=chat('legacy-unanswered',new Date(consentTime-10_000).toISOString());
    assert.equal(original.privateReader,undefined);
    assert.equal(needsOnlineApproval(approval,original),true);
    let records=[original],attempted=false,requests=0,requestedSession;
    const context={
      editing:{session:original,messageId:'legacy-unanswered-q'},sessions:records,reviseConversation,uid:()=>`revision-${keepCards}`,readerMode:'online',needsOnlineApproval,onlineApproval:{current:approval},
      setSessions:update=>{records=update(records);},setEditing:()=>{},openSession:()=>{},setToast:()=>{},t:value=>value,
      generate:session=>{attempted=true;requestedSession=session;if(!needsOnlineApproval(approval,session))requests++;},
    };
    const revise=new Function(...Object.keys(context),`${code}; return revise;`)(...Object.values(context));
    revise('I still want help with my original private question.','Revised question',keepCards,count,'');
    assert.equal(attempted,true);
    assert.ok(Date.parse(requestedSession.date)>consentTime);
    assert.equal(requestedSession.privateReader,true);
    assert.equal(requests,0,'An edited old private chat must not silently become an online request.');
    const restored=parseDataImport(createDataExport(journal(records))).sessions.find(session=>session.id===requestedSession.id);
    assert.equal(needsOnlineApproval(approval,restored),true,'The approval requirement must also survive a reload or backup.');
  }
});
