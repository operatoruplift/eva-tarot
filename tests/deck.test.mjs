import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cards, drawCards } from '../src/data/tarot.ts';
import { tarotVi } from '../src/data/tarot-vi.ts';

const majorNames = ['The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor', 'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit', 'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance', 'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World'];
const ranks = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];
const suits = ['Wands', 'Cups', 'Swords', 'Pentacles'];
const expectedNames = [...majorNames, ...suits.flatMap(suit => ranks.map(rank => `${rank} of ${suit}`))];

test('the complete deck follows the exact requested 1–78 order while keeping existing IDs', () => {
  assert.equal(cards.length, 78);
  assert.deepEqual(cards.map(card => card.name), expectedNames);
  assert.deepEqual(cards.map(card => card.id), Array.from({ length: 78 }, (_, index) => index));
  assert.deepEqual(cards.map(card => card.number), Array.from({ length: 78 }, (_, index) => index + 1));
  assert.equal(cards[0].roman, '0'); assert.equal(cards[21].roman, 'XXI');
  assert.equal(cards[0].image, '/cards/the-fool.jpg'); assert.equal(cards[21].image, '/cards/the-world.jpg');
  assert.deepEqual(cards.slice(0, 22).map(card => card.name), majorNames);
});

test('each minor suit contains Ace through King with distinct complete interpretations', () => {
  for (const [index, suit] of suits.entries()) {
    const group = cards.slice(22 + index * 14, 36 + index * 14);
    assert.equal(group.length, 14);
    assert.ok(group.every(card => card.suit === suit.toLowerCase()));
    assert.deepEqual(group.map(card => card.rank), ranks.map(rank => rank.toLowerCase()));
    assert.equal(new Set(group.map(card => card.meaning)).size, 14);
    for (const card of group) {
      assert.equal(card.keywords.length, 3);
      assert.ok(card.meaning.length > 180); assert.ok(card.reflection.endsWith('?'));
    }
  }
});

test('all 78 cards have original Vietnamese names, keywords, meanings, and reflection prompts', () => {
  assert.equal(Object.keys(tarotVi).length, 78);
  for (const card of cards) {
    const translation = tarotVi[card.id];
    assert.ok(translation, `Missing Vietnamese for ${card.name}`);
    assert.ok(translation.name.length > 0); assert.notEqual(translation.name, card.name);
    assert.equal(translation.keywords.length, 3);
    assert.ok(translation.meaning.length > 150); assert.notEqual(translation.meaning, card.meaning);
    assert.ok(translation.reflection.endsWith('?')); assert.notEqual(translation.reflection, card.reflection);
  }
  assert.equal(tarotVi[22].name, 'Át Gậy'); assert.equal(tarotVi[77].name, 'Vua Tiền');
});

test('every deck image is a vendored JPEG and has a unique asset path', async () => {
  assert.equal(new Set(cards.map(card => card.image)).size, 78);
  await Promise.all(cards.map(async card => {
    assert.match(card.image, /^\/cards\/[a-z0-9-]+\.jpg$/);
    const content = await readFile(new URL(`../public${card.image}`, import.meta.url));
    assert.ok(content.length > 1000, `${card.name} image is unexpectedly small`);
    assert.deepEqual([...content.subarray(0, 3)], [255, 216, 255], `${card.name} is not a JPEG`);
  }));
});

test('the crypto shuffle can draw the entire 78-card deck without duplicates or mutation', () => {
  const before = cards.map(card => card.id);
  for (const count of [1, 3, 10, 22, 56, 78]) {
    const drawn = drawCards(count);
    assert.equal(drawn.length, count); assert.equal(new Set(drawn.map(card => card.id)).size, count);
    assert.ok(drawn.every(card => cards[card.id] === card));
    if (count === 78) assert.deepEqual(drawn.map(card => card.id).sort((a, b) => a - b), before);
  }
  assert.deepEqual(cards.map(card => card.id), before);
  for (const count of [0, -1, 79, 1.5, NaN]) assert.throws(() => drawCards(count), RangeError);
});
