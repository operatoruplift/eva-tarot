import test from 'node:test';
import assert from 'node:assert/strict';
import { latestQuestion, hasReplyForCurrentSpread, hasReplyToLatestQuestion, cardsForQuestion } from '../src/lib/conversation-flow.ts';
import { cards } from '../src/data/tarot.ts';

const messages = [
  {id:'q1',role:'user',text:'I feel stuck at work.'},
  {id:'c1',role:'assistant',text:'',cards:cards.slice(0,3)},
  {id:'a1',role:'assistant',text:'An earlier reflection.',mode:'local'},
  {id:'q2',role:'user',text:'Actually, my concern is asking for a clearer schedule.'},
  {id:'c2',role:'assistant',text:'',cards:cards.slice(10,15)},
];
test('a fresh draw uses the latest concern and requests a full reading',()=>{
  assert.equal(latestQuestion({messages,title:'Earlier title'}),messages[3].text);
  assert.equal(hasReplyForCurrentSpread(messages),false);
  assert.equal(hasReplyForCurrentSpread([...messages,{id:'a2',role:'assistant',text:'New reading',mode:'local'}]),true);
  assert.equal(hasReplyForCurrentSpread([...messages,{id:'r2',role:'assistant',text:'Reference',mode:'demo'}]),false);
});
test('an earlier question keeps its own cards after a later spread is drawn',()=>{
  assert.deepEqual(cardsForQuestion(messages,'q1'),messages[1].cards);
  assert.deepEqual(cardsForQuestion(messages,'q2'),messages[4].cards);
  assert.deepEqual(cardsForQuestion(messages.slice(0,4),'q2'),messages[1].cards);
  assert.deepEqual(cardsForQuestion(messages,'missing'),[]);
});
test('leaving a draw continues an unanswered question but does not duplicate an existing reply',()=>{
  assert.equal(hasReplyToLatestQuestion(messages.slice(0,3)),true);
  assert.equal(hasReplyToLatestQuestion(messages.slice(0,4)),false);
  assert.equal(hasReplyToLatestQuestion(messages.slice(0,2)),false);
  assert.equal(hasReplyToLatestQuestion([...messages,{id:'reference',role:'assistant',text:'Meanings',mode:'demo'}]),true);
});
