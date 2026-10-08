import test from 'node:test';
import assert from 'node:assert/strict';
import { reviseConversation } from '../src/lib/revisions.ts';
import { cards } from '../src/data/tarot.ts';
import { validSessions } from '../src/lib/storage.ts';
import { mergePersonalData } from '../src/lib/persistence.ts';
const source = {id:'original',title:'My question',focus:'Growth',date:'2026-10-06T08:00:00Z',saved:true,note:'Keep this',drawCount:3,messages:[{id:'q',role:'user',text:'Old question'},{id:'c',role:'assistant',text:'',cards:cards.slice(0,3)},{id:'a',role:'assistant',text:'Old answer',mode:'demo'},{id:'f',role:'user',text:'Follow-up'}]};
const options={id:'revision',now:'2026-10-07T08:00:00Z',keepCards:true,count:3};
test('revising the first question retains cards and original while discarding stale answers in the branch',()=>{
 const revision=reviseConversation(source,'q','Changed question','Revised title',options);
 assert.equal(source.messages[0].text,'Old question'); assert.equal(revision.revisedFrom,source.id);
 assert.equal(revision.messages.at(-1).text,'Changed question'); assert.equal(revision.messages.some(m=>m.text==='Old answer'),false);
 assert.deepEqual(revision.messages.find(m=>m.cards)?.cards,source.messages[1].cards);
 assert.ok(validSessions([source,revision]));
 const original={profile:{name:'',onboarded:false},sessions:[source],practiceDays:[],dayNotes:{}};
 const merged=mergePersonalData(original,{...original,sessions:[revision,source]},original);
 assert.equal(merged.sessions.length,2);assert.equal(merged.sessions[0].revisedFrom,'original');
});
test('revising a follow-up keeps earlier context; choosing new cards starts a clean reading',()=>{
 const revision=reviseConversation(source,'f','New follow-up','',options);
 assert.ok(revision.messages.some(m=>m.text==='Old answer'));assert.equal(revision.messages.at(-1).text,'New follow-up');
 const redraw=reviseConversation(source,'q','New question','',{...options,keepCards:false,count:5});
 assert.equal(redraw.drawCount,5);assert.equal(redraw.messages.length,1);assert.ok(validSessions([redraw]));
 assert.throws(()=>reviseConversation(source,'missing','x','',options));
});
test('editing an earlier question cannot inherit a later unrelated spread',()=>{
 const multi={...source,messages:[...source.messages,{id:'c2',role:'assistant',text:'',cards:cards.slice(10,15)}]};
 const early=reviseConversation(multi,'q','Changed original','',options);
 assert.deepEqual(early.messages.find(m=>m.cards)?.cards,cards.slice(0,3));
 const later=reviseConversation(multi,'f','Changed later question','',options);
 assert.deepEqual(later.messages.filter(m=>m.cards).at(-1)?.cards,cards.slice(10,15));
 assert.equal(later.drawCount,5);
 assert.ok(validSessions([early,later].map((s,i)=>({...s,id:`revision-${i}`}))));
});
