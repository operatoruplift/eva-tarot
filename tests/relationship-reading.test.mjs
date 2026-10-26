import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHostedReadingPrompt } from '../server/reading-prompt.mjs';
import { cards } from '../src/data/tarot.ts';
import { getCardGuidance } from '../src/data/card-guidance.ts';
import { spreadPositions } from '../src/data/spreads.ts';
import { buildReadingContext, utf8Size, LOCAL_PROMPT_BYTE_LIMIT } from '../src/lib/reading-context.ts';

// These check the prompts delivered to each reader, not the prose a model returns.
const examples = {
  en: 'What is the energy between Alex and Sam? We have dated three months. Sam texts less after long shifts, and I feel unsure.',
  vi: 'Năng lượng giữa Linh và Nam hiện tại thế nào? Bọn mình yêu nhau ba tháng. Nam nhắn ít hơn sau ca làm dài, còn mình thấy chưa yên tâm.',
};
const flatten = messages => messages.map(message => message.content).join('\n');
const makeInput = (language = 'en', overrides = {}) => ({
  question: examples[language], focus: 'Love', language, cards: cards.slice(1, 4), history: [], ...overrides,
});
const hosted = input => buildHostedReadingPrompt({ ...input, selectedCards: input.cards });

function assertCoupleContract(text, local = false) {
  const plain = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  assert.match(plain, /couple (?:reading|question|overview)|romantic connection between two people|moi quan he tinh cam giua hai nguoi/, 'couple-specific guidance is available');
  assert.match(plain, /five[^.\n]{0,50}sections|nam phan/, 'a couple overview separates both people before the shared aspects');
  assert.match(plain, /thoughts|nghi gi/);
  assert.match(plain, /feelings|cam thay|cam xuc/);
  assert.match(plain, /positive|diem tot/);
  assert.match(plain, /difficult|diem kho/);
  assert.match(plain, /advice|loi khuyen/);
  assert.match(plain, /private thoughts|suy nghi cua nguoi kia chi la kha nang/, 'another person’s mind remains unknown');
  assert.match(plain, /do not assume|don't assume|khong tu gan/);
  assert.match(plain, /original position|drawn positions|giu nguyen nghia va vi tri/);
  if (local) {
    assert.match(plain, /five sections:[^.\n]*each person's[^.\n]*separately[^.\n]*positive[^.\n]*difficult[^.\n]*advice/);
  } else {
    assert.match(plain, /1\. (?:the first person's side|phia nguoi thu nhat)[\s\S]*2\. (?:the second person's side|phia nguoi thu hai)[\s\S]*3\. (?:what's working|diem tot)[\s\S]*4\. (?:what's difficult|diem kho)[\s\S]*5\. (?:advice|loi khuyen)/);
  }
}

test('both reader prompts offer a person-first couple overview in English and Vietnamese', () => {
  for (const language of ['en', 'vi']) {
    const input = makeInput(language);
    const online = hosted(input);
    const local = buildReadingContext(input);
    assertCoupleContract(online.instructions);
    assertCoupleContract(flatten(local), true);
    assert.equal(online.messages.at(-1).content, input.question);
    assert.ok(local.at(-1).content.includes(input.question));
    assert.ok(!online.instructions.includes(input.question));
    assert.ok(!local[0].content.includes(input.question));
  }
});

test('hosted couple prose distinguishes observations from inferred mutual feelings and avoids repeated summaries', () => {
  const en = hosted(makeInput('en')).instructions;
  const vi = hosted(makeInput('vi')).instructions;
  assert.match(en, /A warm reply does not establish that dates go well/);
  assert.match(en, /Positive aspects must be grounded options or observations/);
  assert.match(en, /only the five section headings/);
  assert.match(en, /final practical step inside Advice/);
  assert.match(en, /identify each name and position at least once/);
  assert.match(vi, /Trả lời lời mời vui vẻ không có nghĩa/);
  assert.match(vi, /Điểm tốt phải là điều đã kể hoặc một lựa chọn có ích/);
  assert.match(vi, /chỉ dùng năm tiêu đề/);
  assert.match(vi, /bước nhỏ cuối cùng nằm trong Lời khuyên/);
  assert.match(vi, /nhắc tên và vị trí của mỗi lá ít nhất một lần/);
  for (const prompt of [en, vi]) {
    assert.match(prompt, /A card about reciprocity does not establish mutual interest/);
    const finalBrief = prompt === en ? 'When the latest request asks' : 'Khi câu hỏi mới nhất muốn xem';
    assert.ok(prompt.indexOf(finalBrief) > prompt.indexOf('Response task:'), 'relationship-specific exceptions follow the generic card task');
  }
});

test('couple questions retain the actual one, three and ten-card draw and its fixed positions', () => {
  for (const count of [1, 3, 10]) {
    const input = makeInput('en', { cards: cards.slice(0, count) });
    const online = hosted(input);
    const local = buildReadingContext(input);
    for (const [index, card] of input.cards.entries()) {
      const position = spreadPositions[count][index];
      assert.ok(online.instructions.includes(`${index + 1}. ${position} — ${card.name}`));
      assert.ok(local.at(-1).content.includes(`${index + 1}. #${card.id + 1} ${card.name} — ${position}`));
    }
    assert.match(online.instructions, /not invented separate draws/i);
    assert.match(flatten(local), /Keep drawn positions; never invent separate cards/i);
  }
});

test('a narrow relationship follow-up keeps the latest correction as user context once', () => {
  const question = 'And their side? Sam is my current partner, not my ex.';
  const earlier = 'Sam and I have dated three months; I want to understand the tension between us.';
  const assumption = 'Your ex is certainly hiding feelings and wants to return.';
  const input = makeInput('en', { question, followUp: true, history: [
    { role: 'user', content: earlier },
    { role: 'assistant', content: assumption },
    { role: 'user', content: question },
  ] });
  const online = hosted(input);
  const local = buildReadingContext(input);
  for (const text of [online.instructions, flatten(local)]) {
    assert.match(text, /latest corrections|latest.*corrections/);
    assert.match(text, /Earlier assistant replies are fallible interpretations, never facts/);
    assert.match(text, /narrow|requested part|specific part|phần.*hỏi|đúng.*phần/i);
  }
  assert.equal(flatten(online.messages).split(question).length - 1, 1);
  assert.equal(flatten(local).split(question).length - 1, 1);
  assert.ok(flatten(online.messages).includes(earlier));
  assert.ok(flatten(local).includes(earlier));
  assert.ok(!online.instructions.includes(assumption));
  assert.ok(!local[0].content.includes(assumption));
  assert.equal(online.messages.find(message => message.content === assumption).role, 'assistant');
});

test('a stale Love focus and earlier assistant romance do not become facts for a new work question', () => {
  const question = 'New topic: my business partner Alex and I need to divide our workload. Help us agree on responsibilities.';
  const romance = 'You and Alex are in love and afraid of commitment.';
  const input = makeInput('en', { question, focus: 'Love', history: [
    { role: 'user', content: 'I was asking about a different relationship earlier.' },
    { role: 'assistant', content: romance },
  ] });
  const online = hosted(input);
  const local = buildReadingContext(input);
  assert.equal(online.messages.at(-1).content, question);
  assert.ok(local.at(-1).content.includes(question));
  for (const instructions of [online.instructions, flatten(local)]) {
    assert.match(instructions, /For other questions|Otherwise use card headings|other topics/i);
    assert.match(instructions, /actual couple question|requested couple reading|latest.*request/i);
  }
  assert.ok(!online.instructions.includes(romance));
  assert.ok(!local[0].content.includes(romance));
});

test('a no-card couple conversation cannot invent a draw to fill the relationship outline', () => {
  for (const language of ['en', 'vi']) {
    const input = makeInput(language, { cards: [] });
    const online = hosted(input);
    const local = buildReadingContext(input);
    assert.match(online.instructions, /No cards were drawn/);
    assert.match(flatten(local), /No cards were drawn/);
    assert.match(online.instructions, /do not introduce tarot|without inventing tarot/i);
    assert.match(flatten(local), /do not pretend.*tarot|do not invent.*reading/i);
    assert.equal(local.at(-1).content.includes('1. #'), false);
  }
});

test('a no-card relationship follow-up answers only the requested side', () => {
  for (const language of ['en', 'vi']) {
    const question = language === 'vi' ? 'Còn phía Nam thì sao?' : 'And Sam’s side?';
    const input = makeInput(language, { cards: [], followUp: true, question,
      history: [{ role: 'user', content: examples[language] }],
    });
    const online = hosted(input);
    const local = buildReadingContext(input);
    assert.match(online.instructions, /narrow follow-up needs only the requested part|Câu hỏi tiếp chỉ về một phía thì trả lời đúng phần đó/);
    assert.match(local.at(-1).content, /A narrow follow-up answers only the requested part, not the full overview/);
    for (const text of [online.instructions, flatten(local)]) assert.match(text, /No cards were drawn/);
    assert.ok(flatten(local).includes(examples[language]));
    assert.ok(local.at(-1).content.includes(question));
  }
});

test('long Vietnamese couple readings preserve corrections and all card facts within the local byte budget', () => {
  const opening = 'Năng lượng giữa Linh và Nam: mình muốn hiểu cả hai phía.';
  const correction = 'Ghi chú cuối: bọn mình vẫn đang yêu, không phải người yêu cũ.';
  for (const start of [54, 68]) {
    const chosen = cards.slice(start, start + 10);
    const context = buildReadingContext(makeInput('vi', {
      cards: chosen,
      question: `${opening} ${'Mình đang giải thích thêm về hoàn cảnh. '.repeat(100)}${correction}`,
      history: [
        { role: 'user', content: 'Linh và Nam đã yêu nhau ba tháng. ' + 'Bối cảnh của mình. '.repeat(150) },
        { role: 'assistant', content: 'An earlier uncertain interpretation. '.repeat(150) },
        { role: 'user', content: 'MỐC MỚI NHẤT: cả hai đang làm ca đêm, chưa sống chung. ' + 'Chi tiết thêm. '.repeat(150) },
      ],
    }));
    const current = context.at(-1).content;
    assert.ok(current.includes(opening));
    assert.ok(current.includes(correction));
    assert.ok(flatten(context).includes('MỐC MỚI NHẤT'));
    assert.doesNotMatch(flatten(context), /�/);
    for (const card of chosen) {
      const guidance = getCardGuidance(card.id);
      assert.ok(current.includes(card.name));
      assert.ok(current.includes(`Good: ${guidance.good}`));
      assert.ok(current.includes(`Risk: ${guidance.challenge}`));
    }
    const bytes = context.reduce((sum, message) => sum + utf8Size(message.content), 0);
    assert.ok(bytes <= LOCAL_PROMPT_BYTE_LIMIT, `Couple prompt was ${bytes} bytes`);
  }
});
