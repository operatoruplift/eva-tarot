import type { Session } from './storage.ts';

/** Editing a question makes a new branch; existing answers never become answers
 * to a question the reader did not originally ask. The source stays recoverable. */
export function reviseConversation(source: Session, messageId: string, question: string, title: string, options: { id: string; now: string; keepCards: boolean; count: number }): Session {
  const index = source.messages.findIndex(message => message.id === messageId && message.role === 'user');
  if (index < 0 || !question.trim() || question.length > 1000) throw new Error('Choose a question to edit.');
  const selected = [...source.messages].reverse().find(message => message.cards?.length)?.cards;
  const messages = source.messages.slice(0, index).map(message => ({ ...message }));
  if (!options.keepCards) messages.splice(0);
  // Keep one canonical spread available even when the first question is edited.
  if (options.keepCards && selected?.length && !messages.some(message => message.cards?.length)) {
    messages.push({ id: `${options.id}-cards`, role: 'assistant', text: '', cards: selected, createdAt: options.now });
  }
  messages.push({ id: `${options.id}-question`, role: 'user', text: question.trim(), createdAt: options.now });
  return { ...source, id: options.id, title: title.trim() || question.trim(), date: options.now, messages, daily: false, saved: false, revisedFrom: source.id, drawCount: options.keepCards ? (selected?.length || 0) : options.count };
}
