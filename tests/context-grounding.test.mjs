import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../src/data/tarot.ts';
import { getCardGuidance } from '../src/data/card-guidance.ts';
import { buildReadingContext, conversationContext, utf8Size, LOCAL_PROMPT_BYTE_LIMIT } from '../src/lib/reading-context.ts';

const flattened = context => context.map(message => message.content).join('\n');

test('user circumstances and feelings survive many long assistant interpretations', () => {
  const history = [
    {role:'user', content:'Hello'},
    {role:'user', content:'I care for my mum and work night shifts. I feel exhausted and guilty about resting.'},
    ...Array.from({length:7},(_,index)=>[
      {role:'assistant',content:`You are afraid of success. ${'An earlier interpretation. '.repeat(200)}`},
      {role:'user',content:index===6?'I am not afraid of success. I cannot reduce my hours because of rent.':'Can you explain what you mean?'},
    ]).flat(),
  ];
  const result=buildReadingContext({question:'What could I realistically do next?',focus:'',cards:cards.slice(0,10),followUp:true,history});
  const text=flattened(result);
  assert.match(text,/care for my mum/);
  assert.match(text,/night shifts/);
  assert.match(text,/exhausted and guilty/);
  assert.match(text,/cannot reduce my hours because of rent/);
  assert.match(text,/latest corrections/);
  assert.match(text,/Earlier assistant replies are fallible interpretations, never facts/);
  assert.equal(result.filter(message=>message.role==='assistant').length,1);
  assert.ok(!result.some(message=>message.content.length<30));
  assert.ok(result.reduce((total,message)=>total+utf8Size(message.content),0)<=LOCAL_PROMPT_BYTE_LIMIT);
});

test('late clarifications survive long Vietnamese messages without broken characters', () => {
  const question='Tôi đang thấy kiệt sức vì công việc. '+ 'Tôi đang cố giải thích tình huống này. '.repeat(120)+'Điều quan trọng: tôi muốn ở lại công việc này, không nghỉ việc.';
  const result=buildReadingContext({question,focus:'',cards:cards.slice(0,10),language:'vi'});
  const current=result.at(-1).content;
  assert.match(current,/Tôi đang thấy kiệt sức/);
  assert.match(current,/tôi muốn ở lại công việc này, không nghỉ việc/);
  assert.doesNotMatch(current,/�/);
});

test('static card notes do not become earlier personalized model replies', () => {
  const messages=[
    {role:'user',text:'I feel torn about returning to work.'},
    {role:'assistant',text:'Draw when ready.'},
    {role:'assistant',mode:'demo',text:'General preset notes about a card.'},
    {role:'assistant',mode:'local',text:'You said you feel torn.'},
    {role:'user',text:'I need flexible hours.'},
    {role:'assistant',mode:'ai',text:'Ask about flexible hours.'},
  ];
  assert.deepEqual(conversationContext(messages).map(message=>message.content),[
    'I feel torn about returning to work.','You said you feel torn.','I need flexible hours.','Ask about flexible hours.',
  ]);
});

test('the same cards use distinct user situations, not a fixed personal narrative', () => {
  const common={cards:[cards[0]],focus:'',language:'en'};
  const work=flattened(buildReadingContext({...common,question:'I feel worn out at work but cannot afford to quit.'}));
  const love=flattened(buildReadingContext({...common,question:'I feel excited about dating again and want to take it slowly.'}));
  assert.match(work,/cannot afford to quit/);assert.doesNotMatch(work,/excited about dating/);
  assert.match(love,/excited about dating/);assert.doesNotMatch(love,/worn out at work/);
  for(const text of [work,love]) {
    assert.match(text,/cards are inspiration, not evidence or predictions/);
    assert.match(text,/Acknowledge only feelings they actually named/);
    assert.match(text,/a detail from their chat/);
  }
});

test('all spread sizes preserve context and card identities inside the byte budget', () => {
  for(const count of [0,1,3,5,10]) for(const language of ['en','vi']) {
    const chosen=cards.slice(68,68+count);
    const result=buildReadingContext({question:('I need help deciding. Tôi đang bối rối. ').repeat(100),focus:'',cards:chosen,language,history:Array.from({length:30},(_,index)=>({role:index%2?'assistant':'user',content:`Turn ${index}: ${'Tôi có trách nhiệm chăm sóc gia đình. '.repeat(100)}`}))});
    assert.ok(result.reduce((sum,message)=>sum+utf8Size(message.content),0)<=LOCAL_PROMPT_BYTE_LIMIT);
    for(const card of chosen) assert.ok(result.at(-1).content.includes(card.name));
    assert.equal(result.filter(message=>message.role==='assistant').length,1);
  }
});

test('a long first ten-card reading retains meaningful canonical strengths and risks for every card', () => {
  const chosen=cards.slice(68,78);
  const input={
    question:'Tôi muốn hiểu rõ lựa chọn của mình. '.repeat(120),
    focus:'',cards:chosen,language:'vi',followUp:false,
    history:Array.from({length:6},(_,index)=>({role:'user',content:`Detail ${index}: ${'Tôi có trách nhiệm chăm sóc gia đình. '.repeat(25)}`})),
  };
  for(const includeAssistant of [false,true]) {
    const history=includeAssistant?[...input.history,{role:'assistant',content:'An optional earlier interpretation. '.repeat(200)}]:input.history;
    const result=buildReadingContext({...input,history});
    const current=result.at(-1).content;
    for(const card of chosen) {
      const canonical=getCardGuidance(card.id);
      assert.ok(current.includes(`Good: ${canonical.good}`),`${card.name} lost its useful strength`);
      assert.ok(current.includes(`Risk: ${canonical.challenge}`),`${card.name} lost its useful risk`);
    }
    assert.match(flattened(result),/Detail 0: Tôi có trách nhiệm chăm sóc gia đình/);
    assert.match(flattened(result),/Detail 5: Tôi có trách nhiệm chăm sóc gia đình/);
    assert.doesNotMatch(current,/�/);
    assert.ok(result.reduce((total,message)=>total+utf8Size(message.content),0)<=LOCAL_PROMPT_BYTE_LIMIT);
    if(includeAssistant) {
      const recentUser=result.slice(1,-1).find(message=>message.role==='user');
      const assistant=result.find(message=>message.role==='assistant');
      assert.ok(utf8Size(recentUser.content)>utf8Size(assistant.content),'user context should receive more room than optional AI history');
    }
  }
});
