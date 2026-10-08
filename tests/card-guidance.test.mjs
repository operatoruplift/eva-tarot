import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../src/data/tarot.ts';
import { tarotVi } from '../src/data/tarot-vi.ts';
import { getCardGuidance } from '../src/data/card-guidance.ts';
import { generateDemoReading } from '../src/lib/readings.ts';

const fields = ['meaning', 'good', 'challenge', 'advice', 'direction'];
const labels = {
  en: ['Meaning', 'Good side', 'Difficult side', 'Advice', 'Clear direction'],
  vi: ['Ý nghĩa', 'Mặt thuận lợi', 'Mặt khó khăn', 'Lời khuyên', 'Hướng đi cụ thể'],
};
const request = { question: 'What could help me make a considered next step?', focus: 'Personal growth' };

test('all 78 cards have complete bilingual five-part guidance tied to canonical meanings', () => {
  for (const card of cards) {
    const english = getCardGuidance(card.id);
    const vietnamese = getCardGuidance(card.id, 'vi');
    assert.deepEqual(Object.keys(english), fields);
    assert.equal(english.meaning, card.meaning, card.name);
    assert.equal(vietnamese.meaning, tarotVi[card.id].meaning, card.name);
    for (const field of fields) {
      assert.ok(english[field].length > 35, `${card.name}: short English ${field}`);
      assert.ok(vietnamese[field].length > 35, `${card.name}: short Vietnamese ${field}`);
      assert.notEqual(english[field], vietnamese[field], `${card.name}: untranslated ${field}`);
    }
  }
});

test('the good, difficult, advisory, and directional entries are specific rather than duplicated boilerplate', () => {
  for (const language of ['en', 'vi']) {
    for (const field of fields.slice(1)) {
      assert.equal(new Set(cards.map(card => getCardGuidance(card.id, language)[field])).size, 78, `${language}: repeated ${field}`);
    }
  }
  assert.match(getCardGuidance(0).direction, /low-stakes/);
  assert.match(getCardGuidance(15).direction, /trigger/);
  assert.match(getCardGuidance(37).direction, /each person names one need/);
  assert.match(getCardGuidance(60).direction, /original source/);
  assert.match(getCardGuidance(71).direction, /practice session/);
  assert.match(getCardGuidance(73).direction, /long-term household or community/);
});

test('each card reference shows all five separated labels and the correct bilingual identity', () => {
  for (const language of ['en', 'vi']) {
    for (const card of cards) {
      const reading = generateDemoReading({ ...request, cards: [card], language });
      const expected = getCardGuidance(card.id, language);
      assert.ok(reading.includes(language === 'vi' ? tarotVi[card.id].name : card.name));
      for (const [index, label] of labels[language].entries()) {
        assert.ok(reading.includes(`\n\n**${label}:** ${expected[fields[index]]}`), `${card.name}: missing ${language} ${label}`);
      }
    }
  }
});

test('follow-up references retain five useful sections without repeating the complete original meaning', () => {
  const selected = [cards[17], cards[41], cards[70]];
  for (const language of ['en', 'vi']) {
    const initial = generateDemoReading({ ...request, cards: selected, language });
    const followUp = generateDemoReading({ ...request, question: 'What should I pay attention to first?', cards: selected, language, history: [{ role: 'user', content: request.question }, { role: 'assistant', content: initial }] });
    assert.ok(followUp.length < initial.length);
    for (const label of labels[language]) assert.equal(followUp.split(`**${label}:**`).length - 1, 3);
    for (const card of selected) {
      assert.ok(!followUp.includes(getCardGuidance(card.id, language).meaning));
      assert.ok(followUp.includes(getCardGuidance(card.id, language).direction));
      assert.ok(followUp.includes(language === 'vi' ? tarotVi[card.id].reflection : card.reflection));
    }
  }
});

test('a ten-card mixed spread names all cards and correctly describes the full deck', () => {
  const selected = [cards[0], cards[13], cards[22], cards[35], cards[36], cards[49], cards[50], cards[63], cards[64], cards[77]];
  for (const language of ['en', 'vi']) {
    const reading = generateDemoReading({ ...request, cards: selected, language });
    assert.match(reading, /78/);
    for (const label of labels[language]) assert.equal(reading.split(`**${label}:**`).length - 1, 10);
    for (const card of selected) assert.ok(reading.includes(language === 'vi' ? tarotVi[card.id].name : card.name));
    assert.ok(reading.length < 20_000, 'Reading must fit the stored cloud message limit');
  }
});

test('unsupported reference languages disclose English fallback and card facts remain canonical', () => {
  const forged = { ...cards[0], name: 'Invented card', meaning: 'Untrusted certainty' };
  const reading = generateDemoReading({ ...request, cards: [forged], language: 'fr' });
  assert.match(reading, /^Les réflexions/);
  assert.match(reading, /\*\*Good side:\*\*/);
  assert.doesNotMatch(reading, /Untrusted certainty|Invented card/);
  assert.deepEqual(getCardGuidance(0, 'fr'), getCardGuidance(0, 'en'));
  for (const id of [-1, 78, 0.5, NaN, Infinity]) assert.throws(() => getCardGuidance(id), RangeError);
});
