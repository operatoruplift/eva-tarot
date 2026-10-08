import { cards as deck, type TarotCard } from '../data/tarot.ts';
import { getCardGuidance } from '../data/card-guidance.ts';
import { languageNames, spreadPositions, type ReadingLanguage } from '../data/spreads.ts';

export type ContextMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ContextInput = {
  question: string;
  focus: string;
  cards: TarotCard[];
  history?: { role: 'user' | 'assistant'; content: string }[];
  language?: ReadingLanguage;
  /** True once this conversation already has an actual local AI answer. */
  followUp?: boolean;
};

/** Static reference notes are not earlier personal AI interpretations. */
export function conversationContext(messages: ReadonlyArray<{ role: 'user' | 'assistant'; text: string; mode?: string }>): NonNullable<ContextInput['history']> {
  return messages.filter(message => message.role === 'user' || message.mode === 'local' || message.mode === 'ai')
    .map(message => ({ role: message.role, content: message.text }));
}

// UTF-8 bytes are a conservative upper bound for this byte-level tokenizer.
// Reserve room for chat-template tokens and 2,560 generated tokens in an 8K window.
export const LOCAL_CONTEXT_WINDOW = 8_192;
export const LOCAL_PROMPT_BYTE_LIMIT = 5_400;
export const LOCAL_MAX_OUTPUT_TOKENS = 2_560;
const encoder = new TextEncoder();
export const utf8Size = (text: string): number => encoder.encode(text).length;

export function truncateUtf8(text: string, limit: number): string {
  if (limit <= 0) return '';
  let result = '';
  let bytes = 0;
  for (const character of text) {
    const size = utf8Size(character);
    if (bytes + size > limit) break;
    result += character;
    bytes += size;
  }
  return result;
}

function historyExcerpt(text: string, limit: number): string {
  if (utf8Size(text) <= limit) return text;
  // Preserve the end as well as the beginning so "continue" has the point
  // where the earlier answer stopped, not only its opening paragraph.
  const gap = '\n[…]\n';
  if (limit < 100) return truncateUtf8(text, limit);
  const half = Math.floor((limit - utf8Size(gap)) / 2);
  const reversed = [...text].reverse().join('');
  const tail = [...truncateUtf8(reversed, half)].reverse().join('');
  return `${truncateUtf8(text, half)}${gap}${tail}`;
}

export function finishLocalAnswer(text: string, reason: string | null | undefined, language: ReadingLanguage = 'en'): string {
  if (reason !== 'length' || !text.trim()) return text;
  const note = language === 'vi'
    ? 'Câu trả lời này đã đạt giới hạn độ dài của AI trên thiết bị và có thể chưa đầy đủ. Hãy nhắn “Tiếp tục” để đọc phần còn lại.'
    : 'This reply reached the on-device AI length limit and may be incomplete. Send “Continue” to carry on from here.';
  return `${text}\n\n[${note}]`;
}

/** A transparent UI suggestion, not a model interpretation or prediction. */
export function recommendSpread(question: string, history: ContextInput['history'] = []): { count: 1 | 3 | 5 | 10; reason: string } {
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const current = normalize(question);
  const subject = current.length < 30 ? `${normalize(history.filter(message => message.role === 'user').at(-1)?.content ?? '')} ${current}` : current;
  if (/\b(10|ten|muoi|celtic|in.depth|comprehensive|chi tiet|chuyen sau|toan canh|sau sac)\b/.test(subject)) {
    return { count: 10, reason: 'Ten cards give a broad situation room for a detailed reading.' };
  }
  if (/\b(decision|choose|choice|options|stay or|leave|quit|compare|lua chon|quyet dinh|nen hay|hay la|chia tay|nghi viec)\b/.test(subject)) {
    return { count: 5, reason: 'Five cards help explore a choice, its trade-offs, and a practical next step.' };
  }
  if (/\b(today|daily|one card|1 card|hom nay|mot la|1 la|ngay moi)\b/.test(subject)) {
    return { count: 1, reason: 'One card keeps a daily check-in clear and focused.' };
  }
  return { count: 3, reason: 'Three cards explore the situation, what is difficult, and a useful next step.' };
}

export function localOutputTokenLimit(input: Pick<ContextInput, 'cards' | 'followUp'>): number {
  if (input.followUp) return 1_280;
  return input.cards.length === 10 ? LOCAL_MAX_OUTPUT_TOKENS : input.cards.length >= 5 ? 2_048 : input.cards.length === 3 ? 1_536 : input.cards.length === 1 ? 1_024 : 900;
}

function readingTask(input: ContextInput, selectedCount: number, language: string): string {
  const continuation = /^(please\s+)?(continue|go on|carry on|tiep tuc|viet tiep|hay tiep tuc)\b/i.test(input.question.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  if (continuation) {
    const ending = selectedCount > 1 ? 'Finish remaining card sections in everyday terms, connect the cards, and prioritize one small next step.'
      : selectedCount === 1 ? 'Finish this card in everyday terms and suggest one small next step. Do not introduce other cards.'
        : 'Finish in everyday terms. No cards were drawn, so do not invent a tarot reading.';
    return `Continue the previous answer in ${language} from where it ended. Do not restart or repeat the introduction. ${ending}`;
  }
  if (!selectedCount) return `Answer in ${language} from their concern and named feelings. Explain your suggestion with a familiar example that fits their limits. Prioritize one small next step, not a list of homework. No cards were drawn: do not pretend there is a tarot reading. If context is thin, ask one useful question instead of guessing.`;
  if (input.followUp) return `Answer this follow-up in ${language} from the latest message and earlier user context. Acknowledge corrections; do not repeat the whole spread. Explain plainly what your advice means in their day, why it may help, and one small thing to try. Tie any example to a shared detail; do not invent motives or abilities. Cards are reflection prompts; leave aside any that do not fit. Respect their feelings and limits. Ask only if needed. Keep clarifications brief; add detail when useful.`;
  const target = selectedCount === 10 ? '900–1200' : selectedCount === 5 ? '550–750' : selectedCount === 3 ? '350–500' : '200–300';
  const labels = language === 'Vietnamese'
    ? 'Ý nghĩa; Mặt thuận lợi; Mặt khó khăn; Lời khuyên; Hướng đi cụ thể'
    : 'Meaning; Good side; Difficult side; Advice; Clear direction';
  const synthesis = selectedCount === 1
    ? 'Finally, connect this single card to the question. Do not introduce other cards.'
    : 'Finally, explain a connection or tension between at least two named cards. Pick one small step; others are optional.';
  return `Write a ${selectedCount}-card reflection in ${language}, about ${target} words. Open with their situation and named feelings.
For EVERY card in order: a heading with its exact name and spread position, then five paragraphs with bold labels: ${labels}.
Use 1–2 sentences each. Meaning: explain the card using a detail from their chat. Good side: what may help. Difficult side: a conditional risk, including for positive cards. Advice: why an approach fits their limits. Clear direction: what to do or say next, with an everyday example or practical implication. Cover all ${selectedCount} cards. An obstacle needs a downside or blind spot. Do not force links or invent reversals; say when a connection is uncertain.
${synthesis}`;

}

export function buildReadingContext(input: ContextInput): ContextMessage[] {
  const language = languageNames[input.language ?? 'en'] ?? 'English';
  const selected = input.cards.map(card => deck.find(candidate => candidate.id === card.id));
  if (selected.some(card => !card) || new Set(input.cards.map(card => card.id)).size !== input.cards.length) {
    throw new Error('Choose distinct cards from the Eva Tarot deck.');
  }
  if (![0, 1, 3, 5, 10].includes(selected.length)) throw new Error('Choose one, three, five, or ten cards.');
  const tone = language === 'Vietnamese' ? ' Use “bạn” naturally.' : '';
  const rules = `You are Eva Tarot, an AI companion. Reply in ${language}; address the user directly, never as them. User context leads; cards are inspiration, not evidence or predictions. Prioritize their latest corrections, circumstances, feelings and limits. Earlier assistant replies are fallible interpretations, never facts about the user. Acknowledge only feelings they actually named. Use short spoken sentences and familiar words, not a glossary. Examples are possibilities, not facts. Be warm: no flattery, invented experience, motives, skills, fate, diagnoses or guaranteed future. Never invent cards or override user facts. Ask when unsure.${tone}`;
  if (!input.question.trim()) throw new Error('Write a question to start the conversation.');
  const previous = (input.history ?? []).filter(message => message.content.trim());
  if (previous.at(-1)?.role === 'user' && previous.at(-1)?.content.trim() === input.question.trim()) previous.pop();
  const userIndices = previous.flatMap((message, index) => message.role === 'user' ? [index] : []);
  const lastUser = userIndices.at(-1);
  const lastAssistant = previous.reduce((lastIndex, message, index) => message.role === 'assistant' ? index : lastIndex, -1);
  const recentIndices = [lastUser, lastAssistant >= 0 ? lastAssistant : undefined].filter((index): index is number => index !== undefined).sort((a,b) => a-b);
  // Retain the original situation plus later user updates, even beyond six turns.
  // These are excerpts, not inferred memories or claims from earlier AI replies.
  const earlierUsers = userIndices.filter(index => index !== lastUser);
  const anchorIndices = [...new Set([...earlierUsers.slice(0,2), ...earlierUsers.slice(-2)])].filter((index): index is number => index !== undefined).sort((a,b) => a-b);
  const positions = spreadPositions[selected.length] ?? [];
  const titles = selected.map((card, index) => `${index + 1}. #${card!.id + 1} ${card!.name} — ${positions[index] ?? 'Perspective'}`);
  // Reserve complete canonical concepts before excerpting personal context.
  // A fixed per-card byte share can reduce a longer card's guidance to fragments.
  const facts = selected.map((card, index) => {
    const guidance = getCardGuidance(card!.id);
    return `${titles[index]}\nGood: ${guidance.good}\nRisk: ${guidance.challenge}`;
  }).join('\n');
  const task = readingTask(input, selected.length, language);
  const framing = 'USER QUESTION:\n\nEARLIER USER CONTEXT (excerpts, oldest first):\n\nDRAWN CARDS (reflection prompts):\n\nREADING TASK:\n';
  const free = LOCAL_PROMPT_BYTE_LIMIT - utf8Size(rules) - utf8Size(task) - utf8Size(framing) - utf8Size(facts);
  const historyReserve = recentIndices.length ? 720 : 0;
  const anchorReserve = Math.min(480, anchorIndices.length * 120);
  const questionLimit = Math.max(300, Math.min(selected.length >= 5 ? 1_200 : selected.length ? 1_600 : 2_000, free - historyReserve - anchorReserve));
  const question = historyExcerpt(input.question.trim(), questionLimit);
  const anchorBudget = Math.max(0, Math.min(800, free - utf8Size(question) - historyReserve));
  const anchorShare = Math.floor(anchorBudget / Math.max(1,anchorIndices.length));
  const anchors = anchorShare >= 60 ? anchorIndices.map(index => historyExcerpt(previous[index].content.trim(), Math.max(0, anchorShare - 2))).join('\n\n') : '';
  const current: ContextMessage = {
    role: 'user',
    content: selected.length
      ? `USER QUESTION:\n${question}\n\nEARLIER USER CONTEXT (excerpts, oldest first):\n${anchors}\n\nDRAWN CARDS (reflection prompts):\n${facts}\n\nREADING TASK:\n${task}`
      : `${question}\n\nEARLIER USER CONTEXT (excerpts, oldest first):\n${anchors}\n\n${task}`,
  };
  let remaining = LOCAL_PROMPT_BYTE_LIMIT - utf8Size(rules) - utf8Size(current.content);
  const recentContent = new Map<number, string>();
  // Allocate the user's latest account first. Keep a small AI excerpt when possible
  // for continuity, then spend any remaining room on that optional interpretation.
  const assistantReserve = lastAssistant >= 0 ? Math.min(180, Math.floor(remaining / 4)) : 0;
  const prioritizedIndices = [lastUser, lastAssistant >= 0 ? lastAssistant : undefined].filter((index): index is number => index !== undefined);
  for (const index of prioritizedIndices) {
    if (remaining < 60) break;
    const message = previous[index];
    const limit = Math.min(1_200, message.role === 'user' ? remaining - assistantReserve : remaining);
    const content = historyExcerpt(message.content.trim(), limit);
    if (!content) continue;
    remaining -= utf8Size(content);
    recentContent.set(index, content);
  }
  const history: ContextMessage[] = recentIndices.flatMap(index => {
    const content = recentContent.get(index);
    return content ? [{ role: previous[index].role, content }] : [];
  });
  return [{ role: 'system', content: rules }, ...history, current];
}
