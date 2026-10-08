import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedHistory, getReading } from '../src/lib/readings.ts';
import { approveOnlineSession, needsOnlineApproval, readOnlineApproval, saveOnlineApproval } from '../src/lib/reader-mode.ts';

const request = { question: 'I have fifteen minutes after work, not a whole evening.', focus: 'Conversation', cards: [], language: 'en', followUp: true };
async function withFetch(mock, run) { const original = globalThis.fetch; globalThis.fetch = mock; try { await run(); } finally { globalThis.fetch = original; } }

test('online reply sends current question once, recent corrections, and the original situation', async () => {
  const history = [{ role: 'user', content: 'I want to start painting but money is tight.' }, ...Array.from({length: 12}, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Context ${index}` })), { role: 'user', content: request.question }];
  await withFetch(async (url, options) => {
    assert.equal(url, '/api/reading');
    const body = JSON.parse(options.body);
    assert.equal(body.question, request.question);
    assert.equal(body.followUp, true);
    assert.equal(body.history[0].content, history[0].content);
    assert.ok(body.history.some(message => message.content === 'Context 11'));
    assert.ok(!body.history.some(message => message.content === request.question));
    assert.ok(body.history.length <= 8);
    assert.ok(!('signal' in body));
    return Response.json({mode: 'ai', text: 'Use your fifteen minutes to sketch one object with materials you already own.'});
  }, async () => assert.equal((await getReading({...request, history})).mode, 'ai'));
});

test('history preserves original user context even when recent escaped Unicode messages fill the budget', () => {
  const history = [{role:'user',content:'I cannot spend any money.'}, ...Array.from({length:20}, (_, index) => ({role:index%2?'assistant':'user',content:'🙂\\\"\n'.repeat(4_000)}))];
  const bounded = boundedHistory(history);
  assert.equal(bounded[0].content, history[0].content);
  assert.ok(bounded.length <= 8);
  assert.ok(bounded.every(message => message.content.length <= 3_500));
  assert.ok(Buffer.byteLength(JSON.stringify({...request,history:bounded})) < 40_960);
});

test('continuing a long reading preserves its introduction and final advice as labeled excerpts', async () => {
  const opening = 'Your ten-card reading starts with the time you have after work.';
  const ending = 'Card ten: finish by sketching one cup for ten minutes with the pencil you already own.';
  const content = `${opening}\n${'A detailed card interpretation. '.repeat(350)}\n${ending}`;
  await withFetch(async (_url, options) => {
    const body = JSON.parse(options.body);
    const lastReply = body.history.at(-1).content;
    assert.equal(body.continuation, true);
    assert.ok(lastReply.startsWith(opening));
    assert.ok(lastReply.endsWith(ending));
    assert.match(lastReply, /\[Middle of earlier reply omitted\]/);
    assert.ok(lastReply.length <= 3_500);
    return Response.json({mode:'ai',text:'You can build on that ten-minute sketch tomorrow.'});
  }, () => getReading({...request,question:'Continue',history:[{role:'user',content:request.question},{role:'assistant',content}]}));
});

test('head and tail excerpts retain Unicode endings within escaped wire-byte limits', () => {
  const ending = 'Hướng đi cuối cùng: vẽ chiếc cốc trong mười phút. 🌸';
  const history = [{role:'user',content:'I have no money to spend.'}, ...Array.from({length:20}, () => ({role:'assistant',content:`Bắt đầu. ${'🙂\\\"\n'.repeat(4_000)}\n${ending}`}))];
  const bounded = boundedHistory(history, 'Tiếp tục');
  assert.ok(bounded.at(-1).content.endsWith(ending));
  assert.ok(bounded.every(message => message.content.length <= 3_500 && message.content.isWellFormed()));
  assert.ok(Buffer.byteLength(JSON.stringify({...request,history:bounded})) < 40_960);
});

test('network failure and legacy demo service never masquerade as a personal AI answer', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => assert.rejects(getReading(request), /could not connect/));
  await withFetch(async () => Response.json({mode:'demo'}), async () => assert.rejects(getReading(request), /not available/));
  await withFetch(async () => Response.json({error:'The AI connection needs attention.'},{status:503}), async () => assert.rejects(getReading(request), /connection needs attention/));
});

test('only an explicit standalone continuation asks the service to continue a previous reply', async () => {
  for (const [question, continuation] of [['Continue in this job or look for another one?',false],['Tiếp tục',true],['Please continue.',true]]) {
    await withFetch(async (url, options) => { assert.equal(JSON.parse(options.body).continuation,continuation);return Response.json({mode:'ai',text:'Reply'}); }, async () => { await getReading({...request,question}); });
  }
});

test('stopping a hosted reply cancels its request and does not return fallback content', async () => {
  const controller = new AbortController();
  await withFetch((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), {once:true});
    controller.abort();
  }), async () => assert.rejects(getReading({...request,signal:controller.signal}), {name:'AbortError'}));
  let called = false;
  await withFetch(async () => { called=true;return Response.json({mode:'ai',text:'Too late'}); }, async () => assert.rejects(getReading({...request,signal:controller.signal}), {name:'AbortError'}));
  assert.equal(called,false);
});

test('online approval never follows from unavailable or corrupt storage and private chats need explicit migration approval', () => {
  const empty=readOnlineApproval({getItem(){throw new Error('Denied');}});
  assert.equal(needsOnlineApproval(empty,{id:'new',messages:[]}),true);
  assert.deepEqual(readOnlineApproval({getItem:()=>'{invalid'}),empty);
  const accepted=approveOnlineSession(empty,'new');
  assert.equal(needsOnlineApproval(accepted,{id:'another-online',date:new Date(accepted.firstAcceptedAt+1).toISOString(),privateReader:false,messages:[]}),false);
  assert.equal(needsOnlineApproval(accepted,{id:'old-unanswered',date:new Date(accepted.firstAcceptedAt-1).toISOString(),messages:[]}),true);
  const privateChat={id:'private',messages:[{mode:'local'}]};
  assert.equal(needsOnlineApproval(accepted,privateChat),true);
  assert.equal(needsOnlineApproval(approveOnlineSession(accepted,'private'),privateChat),false);
  assert.equal(saveOnlineApproval(accepted,{setItem(){throw new Error('Full');}}),false);
});
