import type { Message, Session } from './storage.ts';

export const DEFAULT_READING_STYLE = 0;

export function latestQuestion(session: Pick<Session, 'messages' | 'title'>): string {
  return [...session.messages].reverse().find(message => message.role === 'user')?.text || session.title;
}

/** A new draw needs a full reading even when earlier draws already have replies. */
export function hasReplyForCurrentSpread(messages: readonly Message[]): boolean {
  let drawIndex = -1;
  messages.forEach((message, index) => { if (message.cards?.length) drawIndex = index; });
  return messages.slice(drawIndex + 1).some(message => message.role === 'assistant' && (message.mode === 'local' || message.mode === 'ai'));
}

export function hasReplyToLatestQuestion(messages: readonly Message[]): boolean {
  let questionIndex = -1;
  messages.forEach((message, index) => { if (message.role === 'user') questionIndex = index; });
  return messages.slice(questionIndex + 1).some(message => message.role === 'assistant' && Boolean(message.mode));
}

/** Cards drawn for this question, otherwise the spread already present before it. */
export function cardsForQuestion(messages: readonly Message[], questionId: string) {
  const index = messages.findIndex(message => message.id === questionId && message.role === 'user');
  if (index < 0) return [];
  const nextQuestion = messages.findIndex((message, position) => position > index && message.role === 'user');
  const throughAnswer = messages.slice(0, nextQuestion < 0 ? messages.length : nextQuestion);
  return [...throughAnswer].reverse().find(message => message.cards?.length)?.cards || [];
}
