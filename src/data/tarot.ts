import { minorCards } from './minor-arcana.ts';

export type TarotCard = {
  id: number;
  name: string;
  roman: string;
  keywords: string[];
  meaning: string;
  reflection: string;
  image: string;
  number?: number;
  suit?: 'major' | 'wands' | 'cups' | 'swords' | 'pentacles';
  rank?: string;
};

// Original contemporary reflections on the Rider–Waite–Smith Major Arcana.
// Traditional imagery: A. E. Waite, The Pictorial Key to the Tarot, Part II (1910).
const majorCards: TarotCard[] = [
  { id: 0, name: 'The Fool', roman: '0', keywords: ['Beginnings', 'Curiosity', 'Trust'], meaning: 'A traveler approaches a cliff with a small bundle, a white rose, and a watchful dog. The Fool invites fresh possibility and openness, while the cliff reminds you to look before taking a leap. Begin with curiosity and a little practical preparation.', reflection: 'What small, considered first step would let you explore something new?', image: '/cards/the-fool.jpg' },
  { id: 1, name: 'The Magician', roman: 'I', keywords: ['Agency', 'Focus', 'Possibility'], meaning: 'The Magician raises one hand toward the sky and points the other toward the earth; the four suit symbols rest on the table. This is an invitation to turn intention into action using the skills and resources already available to you.', reflection: 'Which resource or strength could you put to use today?', image: '/cards/the-magician.jpg' },
  { id: 2, name: 'The High Priestess', roman: 'II', keywords: ['Intuition', 'Stillness', 'Inner wisdom'], meaning: 'Seated between dark and light pillars before a pomegranate veil, the High Priestess holds a partly concealed scroll. She invites patient listening and respect for what is not yet known. Let intuition begin your inquiry, then allow facts and time to deepen it.', reflection: 'What becomes clearer when you give yourself a little quiet?', image: '/cards/the-high-priestess.jpg' },
  { id: 3, name: 'The Empress', roman: 'III', keywords: ['Nurturing', 'Creativity', 'Abundance'], meaning: 'Wheat, flowing water, and a lush landscape surround the Empress. Her imagery speaks to nourishment, creativity, and the conditions that help life flourish. Caring for yourself can be part of creating something meaningful; growth does not have to be rushed.', reflection: 'What part of your life would flourish with more care and attention?', image: '/cards/the-empress.jpg' },
  { id: 4, name: 'The Emperor', roman: 'IV', keywords: ['Stability', 'Boundaries', 'Leadership'], meaning: 'The Emperor sits on a stone throne decorated with rams, with mountains behind him. Structure, responsibility, and firm foundations are central here. Consider where a clear plan or kind but steady boundary would help you feel more secure.', reflection: 'What boundary or simple structure would support you right now?', image: '/cards/the-emperor.jpg' },
  { id: 5, name: 'The Hierophant', roman: 'V', keywords: ['Learning', 'Values', 'Tradition'], meaning: 'The Hierophant teaches between pillars, with two students and crossed keys at his feet. The card points to shared knowledge, traditions, and systems of belief. A trusted teacher may help, while you still get to decide which lessons fit your values.', reflection: 'Which inherited belief supports you, and which deserves a fresh look?', image: '/cards/the-hierophant.jpg' },
  { id: 6, name: 'The Lovers', roman: 'VI', keywords: ['Connection', 'Alignment', 'Choice'], meaning: 'Two figures stand beneath an angel, with two different trees behind them. The Lovers brings attention to honest connection and choices guided by values. It can invite mutual openness in a relationship or greater agreement between what matters to you and what you do.', reflection: 'What choice would honor both your needs and your values?', image: '/cards/the-lovers.jpg' },
  { id: 7, name: 'The Chariot', roman: 'VII', keywords: ['Direction', 'Resolve', 'Momentum'], meaning: 'An armored figure stands under a starry canopy above a black and a white sphinx. The Chariot reflects the effort of directing different impulses toward one purpose. Progress can come from choosing your direction deliberately, with determination and room to adjust.', reflection: 'What deserves your focus, and what can you set aside for now?', image: '/cards/the-chariot.jpg' },
  { id: 8, name: 'Strength', roman: 'VIII', keywords: ['Courage', 'Compassion', 'Patience'], meaning: 'A woman gently tends a lion beneath an infinity symbol. Strength is expressed through patience and compassion rather than force. You can acknowledge strong feelings without letting them decide every action; gentleness and a firm boundary can exist together.', reflection: 'How could you meet a difficult feeling with both kindness and courage?', image: '/cards/strength.jpg' },
  { id: 9, name: 'The Hermit', roman: 'IX', keywords: ['Reflection', 'Discernment', 'Guidance'], meaning: 'The Hermit stands on a snowy height with a staff and a star-lit lantern. The small pool of light suggests finding the next step through reflection, experience, and thoughtful guidance. A pause can be useful without requiring you to withdraw from people who care.', reflection: 'What do you notice when outside expectations become quieter?', image: '/cards/the-hermit.jpg' },
  { id: 10, name: 'Wheel of Fortune', roman: 'X', keywords: ['Cycles', 'Change', 'Perspective'], meaning: 'A turning wheel sits among symbolic creatures, while four winged figures read in the corners. The Wheel draws attention to changing circumstances and recurring patterns. You cannot control every turn, but you can choose how to respond and where to seek steady support.', reflection: 'What is changing, and what remains within your influence?', image: '/cards/wheel-of-fortune.jpg' },
  { id: 11, name: 'Justice', roman: 'XI', keywords: ['Fairness', 'Clarity', 'Accountability'], meaning: 'Justice holds balanced scales and an upright sword between two pillars. The imagery asks for clear thinking, fairness, and ownership of choices. Consider the evidence as well as your feelings, and remember that a fair outcome should include your needs too.', reflection: 'What would a balanced and honest next step look like?', image: '/cards/justice.jpg' },
  { id: 12, name: 'The Hanged Man', roman: 'XII', keywords: ['Perspective', 'Pause', 'Release'], meaning: 'A calm figure hangs by one foot from a living tree, with a halo around the head. The Hanged Man suggests a chosen pause and a different point of view. Loosening an old expectation may reveal an option that urgency has kept out of sight.', reflection: 'What could you see differently if you stopped trying to force an answer?', image: '/cards/the-hanged-man.jpg' },
  { id: 13, name: 'Death', roman: 'XIII', keywords: ['Transition', 'Letting go', 'Renewal'], meaning: 'An armored skeleton rides a white horse beneath a banner bearing a white rose; the sun appears between distant towers. This is imagery of endings and transition, not a prediction of literal death. Change may involve grief as well as space for a new chapter.', reflection: 'What are you ready to release, and what support would help you do it gently?', image: '/cards/death.jpg' },
  { id: 14, name: 'Temperance', roman: 'XIV', keywords: ['Balance', 'Integration', 'Patience'], meaning: 'An angel pours water between two cups with one foot on land and one in water. Temperance points toward measured adjustment, integration, and a sustainable rhythm. Rather than choosing an extreme, experiment with a combination that respects your real capacity.', reflection: 'What small adjustment would bring more ease and balance to your day?', image: '/cards/temperance.jpg' },
  { id: 15, name: 'The Devil', roman: 'XV', keywords: ['Awareness', 'Attachment', 'Freedom'], meaning: 'Two figures stand loosely chained below a horned figure. This image invites an honest look at habits, pressure, or attachments that can narrow a sense of choice. It does not label anyone as evil. Naming a pattern and seeking support can be a first step toward freedom.', reflection: 'What pattern is taking more from you than it gives back?', image: '/cards/the-devil.jpg' },
  { id: 16, name: 'The Tower', roman: 'XVI', keywords: ['Revelation', 'Disruption', 'Rebuilding'], meaning: 'Lightning strikes a crowned tower, dislodging what seemed secure. The Tower symbolizes a challenge to assumptions or a structure that no longer holds. It does not predict disaster. If change is already happening, prioritize grounding and support before deciding what to rebuild.', reflection: 'What feels true now, and what would help you feel supported as you respond?', image: '/cards/the-tower.jpg' },
  { id: 17, name: 'The Star', roman: 'XVII', keywords: ['Hope', 'Renewal', 'Trust'], meaning: 'A figure pours water onto the land and into a pool beneath a large star and seven smaller stars. The Star evokes renewal, openness, and quiet hope. Replenishment can be gradual; a little care today is meaningful even when the whole path is not yet clear.', reflection: 'What small source of hope or nourishment could you return to this week?', image: '/cards/the-star.jpg' },
  { id: 18, name: 'The Moon', roman: 'XVIII', keywords: ['Uncertainty', 'Imagination', 'Listening'], meaning: 'A path winds between two towers beneath the moon, with a dog, a wolf, and a crayfish in the foreground. The Moon makes room for imagination and uneasy uncertainty. Feelings are real experiences, but they do not always establish facts; allow time to check your assumptions.', reflection: 'What do you know, what are you imagining, and what could you gently clarify?', image: '/cards/the-moon.jpg' },
  { id: 19, name: 'The Sun', roman: 'XIX', keywords: ['Joy', 'Clarity', 'Vitality'], meaning: 'A child rides a white horse beneath a radiant sun, with sunflowers beyond a wall. The Sun represents warmth, clarity, and the pleasure of being more fully yourself. Let yourself notice what is working and welcome ordinary moments of joy without needing everything to be perfect.', reflection: 'What makes you feel more like yourself, and how could you make room for it?', image: '/cards/the-sun.jpg' },
  { id: 20, name: 'Judgement', roman: 'XX', keywords: ['Awakening', 'Reflection', 'Renewal'], meaning: 'Figures rise with open arms toward an angel sounding a trumpet. Judgement invites honest reflection, a renewed sense of purpose, and a response to what you have learned. Accountability can be compassionate; your next choice need not be limited by an old story about yourself.', reflection: 'What have you learned that could guide a kinder, more intentional next chapter?', image: '/cards/judgement.jpg' },
  { id: 21, name: 'The World', roman: 'XXI', keywords: ['Completion', 'Wholeness', 'Integration'], meaning: 'A dancing figure is held within a wreath, with four symbolic creatures at the corners. The World represents integration and the recognition of a completed cycle. Pause to acknowledge your effort and carry its lessons forward, even if some parts of life still feel unfinished.', reflection: 'What deserves recognition before you move on to the next thing?', image: '/cards/the-world.jpg' },
];

/** Stable internal IDs retain existing saved readings; display numbers are 1–78. */
export const cards: TarotCard[] = [
  ...majorCards.map(card => ({ ...card, number: card.id + 1, suit: 'major' as const, rank: card.roman })),
  ...minorCards,
];

function randomBelow(limit: number): number {
  // Rejection sampling avoids the modulo bias of randomValue % limit alone.
  const ceiling = Math.floor(0x100000000 / limit) * limit;
  const value = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(value); } while (value[0] >= ceiling);
  return value[0] % limit;
}

export function drawCards(count: number): TarotCard[] {
  if (!Number.isInteger(count) || count < 1 || count > cards.length) {
    throw new RangeError(`Choose between 1 and ${cards.length} cards.`);
  }
  const deck = [...cards];
  for (let index = 0; index < count; index += 1) {
    const selected = index + randomBelow(deck.length - index);
    [deck[index], deck[selected]] = [deck[selected], deck[index]];
  }
  return deck.slice(0, count);
}
