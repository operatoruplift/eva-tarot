import { cards as deck, type TarotCard } from '../data/tarot.ts';
import { tarotVi } from '../data/tarot-vi.ts';
import { spreadPositions, type ReadingLanguage } from '../data/spreads.ts';
import { getCardGuidance } from '../data/card-guidance.ts';

export type ReadingHistoryMessage = { role: 'user' | 'assistant'; content: string };
export type ReadingRequest = {
  question: string;
  focus: string;
  cards: TarotCard[];
  history?: ReadingHistoryMessage[];
  language?: ReadingLanguage;
  followUp?: boolean;
  continuation?: boolean;
  signal?: AbortSignal;
};
export type ReadingResult = { text: string; mode: 'ai' | 'demo' };

const focusActions: Record<string, string> = {
  love: 'Notice where connection feels mutual. A gentle, honest conversation about one need can be a useful place to begin.',
  career: 'Choose one practical action within your control: clarify a priority, ask for useful feedback, or make space for a skill you want to grow.',
  growth: 'Give yourself a small experiment rather than a demand to change everything. Notice what it teaches you about your needs.',
  wellbeing: 'Check in with your energy and choose one manageable act of care. Rest and asking for support are worthwhile options.',
  clarity: 'Separate what you know from what you are assuming. Write down one question you could clarify before choosing your next step.',
  daily: 'Choose one word for how you want to meet today. Then plan one small action that would put that intention into practice.',
};

const focusAliases: Record<string, string> = {
  'love & connection': 'love', relationships: 'love',
  'work & purpose': 'career',
  'personal growth': 'growth',
  'self-care': 'wellbeing',
  'a little direction': 'clarity',
  'daily reflection': 'daily',
};

const focusActionsVi: Record<string, string> = {
  love: 'Chú ý đến nơi sự kết nối đến từ cả hai phía. Một cuộc trò chuyện nhẹ nhàng, chân thành về một nhu cầu có thể là điểm bắt đầu hữu ích.',
  career: 'Chọn một hành động thực tế trong khả năng của bạn: làm rõ một ưu tiên, xin phản hồi hữu ích hoặc dành thời gian phát triển một kỹ năng.',
  growth: 'Thử một thay đổi nhỏ thay vì yêu cầu bản thân thay đổi mọi thứ. Quan sát điều nó giúp bạn hiểu về nhu cầu của mình.',
  wellbeing: 'Lắng nghe mức năng lượng của bạn và chọn một việc chăm sóc bản thân vừa sức. Nghỉ ngơi và tìm sự hỗ trợ đều là những lựa chọn đáng quý.',
  clarity: 'Tách điều bạn biết chắc khỏi điều bạn đang giả định. Viết ra một câu hỏi có thể làm rõ trước khi chọn bước tiếp theo.',
  daily: 'Chọn một từ thể hiện cách bạn muốn đón nhận hôm nay. Sau đó nghĩ đến một hành động nhỏ giúp biến ý định đó thành thực tế.',
};

const positionsVi: Record<number, string[]> = {
  1: ['Góc nhìn dành cho bạn'],
  3: ['Bạn đang ở đâu', 'Điều cần dành chỗ', 'Một bước tiếp theo có thể thử'],
  5: ['Điều đang xảy ra', 'Điều nằm bên dưới', 'Điều hỗ trợ bạn', 'Điều cản trở', 'Bước thực tế tiếp theo'],
  10: ['Hoàn cảnh hiện tại', 'Ảnh hưởng giao thoa', 'Nền tảng của bạn', 'Quá khứ gần đây', 'Điều bạn đang mong muốn', 'Một khả năng sắp tới', 'Thái độ của bạn', 'Môi trường xung quanh', 'Hy vọng và nỗi lo', 'Một hướng đi có thể có'],
};

const demoLanguageNotices: Partial<Record<ReadingLanguage, string>> = {
  es: 'Las reflexiones sin conexión están disponibles en inglés y vietnamita. La siguiente está en inglés; las respuestas de IA en directo pueden usar el idioma elegido.',
  fr: 'Les réflexions hors ligne sont disponibles en anglais et en vietnamien. La suivante est en anglais ; les réponses de l’IA en direct peuvent utiliser la langue choisie.',
  de: 'Offline-Reflexionen sind auf Englisch und Vietnamesisch verfügbar. Die folgende ist auf Englisch; Live-KI-Antworten können die gewählte Sprache verwenden.',
  pt: 'As reflexões offline estão disponíveis em inglês e vietnamita. A seguinte está em inglês; as respostas da IA ao vivo podem usar o idioma escolhido.',
  ja: 'オフラインの振り返りは英語とベトナム語に対応しています。以下は英語です。ライブAIの回答では、選択した言語を使用できます。',
  ko: '오프라인 성찰은 영어와 베트남어로 제공됩니다. 아래 내용은 영어입니다. 실시간 AI 답변은 선택한 언어로 받을 수 있습니다.',
  zh: '离线反思目前提供英语和越南语版本。以下内容为英语；实时 AI 回复可以使用您选择的语言。',
  th: 'บทสะท้อนใจแบบออฟไลน์มีภาษาอังกฤษและภาษาเวียดนาม ข้อความด้านล่างเป็นภาษาอังกฤษ ส่วนคำตอบจาก AI แบบสดสามารถใช้ภาษาที่คุณเลือกได้',
  id: 'Refleksi offline tersedia dalam bahasa Inggris dan Vietnam. Refleksi berikut menggunakan bahasa Inggris; respons AI langsung dapat menggunakan bahasa pilihan Anda.',
  hi: 'ऑफ़लाइन चिंतन अंग्रेज़ी और वियतनामी में उपलब्ध हैं। नीचे दिया गया चिंतन अंग्रेज़ी में है; लाइव AI के उत्तर आपकी चुनी हुई भाषा में हो सकते हैं।',
};

export function generateDemoReading({ question, focus, cards, history, language = 'en' }: ReadingRequest): string {
  const selected = cards.map((card) => deck.find((entry) => entry.id === card.id)).filter((card): card is TarotCard => Boolean(card));
  const vietnamese = language === 'vi';
  if (cards.length && !selected.length) throw new Error(vietnamese ? 'Hãy chọn một lá bài trước khi bắt đầu.' : 'Choose a card before beginning your reading.');
  const normalizedFocus = focus.trim().toLowerCase();
  const focusKey = focusAliases[normalizedFocus] ?? normalizedFocus;
  const action = vietnamese
    ? focusActionsVi[focusKey] ?? 'Chọn một hành động nhỏ tôn trọng nhu cầu và nằm trong khả năng của bạn. Bạn không cần giải quyết mọi thứ hôm nay.'
    : focusActions[focusKey] ?? 'Choose one small action that respects your needs and stays within your control. You do not have to resolve everything today.';
  const topic = question.trim().slice(0, 200);
  const localizedCards = selected.map((card) => vietnamese ? { ...card, ...tarotVi[card.id] } : card);
  const notice = demoLanguageNotices[language];
  const join = (parts: string[]) => [notice, ...parts].filter(Boolean).join('\n\n');
  const cardSections = (card: TarotCard, heading: string, concise = false) => {
    const guidance = getCardGuidance(card.id, language);
    // Follow-ups keep the full five-part structure but recap a meaning instead
    // of repeating the whole original reading. The detail view retains it all.
    const sentences = guidance.meaning.split(/(?<=[.!?])\s+/);
    const meaning = concise ? sentences[1] ?? sentences[0] : guidance.meaning;
    const labels = vietnamese
      ? ['Ý nghĩa', 'Mặt thuận lợi', 'Mặt khó khăn', 'Lời khuyên', 'Hướng đi cụ thể']
      : ['Meaning', 'Good side', 'Difficult side', 'Advice', 'Clear direction'];
    const values = [meaning, guidance.good, guidance.challenge, `${guidance.advice}${concise ? ` ${card.reflection}` : ''}`, guidance.direction];
    return [`### ${heading}`, ...labels.map((label, index) => `**${label}:** ${values[index]}`)].join('\n\n');
  };

  if (!selected.length) {
    return join(vietnamese ? [
      'Một khoảng lặng để trò chuyện. Đây là gợi ý chiêm nghiệm được viết sẵn, không phải câu trả lời từ AI trực tiếp. Không có lá bài nào được rút.',
      `Điều bạn đang suy nghĩ: “${topic}”`,
      'Bạn có thể bắt đầu bằng ba câu: Tôi đang cảm thấy… Điều tôi biết chắc là… Điều tôi có thể tác động lúc này là…',
      `Một bước nhỏ\n${action}`,
      'Trong những điều bạn vừa viết, điều gì cần được bạn quan tâm trước tiên?',
    ] : [
      'A little space to talk. This is a saved reflection prompt, not a live AI response. No cards have been drawn.',
      `What is on your mind: “${topic}”`,
      'Try completing three sentences: I am feeling… What I know for sure is… One thing I can influence right now is…',
      `One small step\n${action}`,
      'Which part of what you wrote would you like to give your attention to first?',
    ]);
  }

  const priorUsers = history?.filter((message) => message.role === 'user') ?? [];
  const priorAssistant = history?.filter((message) => message.role === 'assistant') ?? [];
  // The caller may still hold the state before appending this new question.
  const hasNewQuestion = priorUsers.length > 0 && priorUsers.at(-1)?.content.trim() !== question.trim() && priorAssistant.length > 0;
  // In the app, an initial reading has only welcome and card-reveal messages.
  const hasCompletedExchange = priorAssistant.length >= 3;
  const isFollowUp = priorUsers.length > 1 || hasNewQuestion || hasCompletedExchange || priorAssistant.some((message) => (
    message.content.includes('saved card meanings') || message.content.includes('preset reflection') || message.content.includes('ý nghĩa lá bài được lưu sẵn') ||
    selected.some((card) => message.content.includes(card.name) || message.content.includes(tarotVi[card.id].name))
  ));
  if (isFollowUp) {
    return join(vietnamese ? [
      'Thêm một góc nhìn. Đây là gợi ý chiêm nghiệm được viết sẵn dựa trên những lá bài cũ, không phải câu trả lời từ AI trực tiếp.',
      `Trở lại câu hỏi của bạn: “${topic}”`,
      ...localizedCards.map((card) => cardSections(card, `${card.name} · ${card.keywords.join(', ')}`, true)),
      `Một bước bạn có thể thử\n${action}`,
      'Chọn góc nhìn hữu ích và viết một câu trả lời cho chính mình. Quyết định vẫn thuộc về bạn.',
    ] : [
      'A little more perspective. This is a preset reflection using the same cards, rather than a live AI response.',
      `Returning to your question: “${topic}”`,
      ...localizedCards.map((card) => cardSections(card, `${card.name} · ${card.keywords.join(', ')}`, true)),
      `One step to try\n${action}`,
      'Choose the reflection that feels useful, and write one sentence in response. Your choices remain yours.',
    ]);
  }
  const positions = (vietnamese ? positionsVi : spreadPositions)[selected.length] ?? [];
  const parts = localizedCards.map((card, index) => cardSections(card, `${selected.length === 10 ? `${index + 1}. ` : ''}${positions[index] ?? (vietnamese ? 'Thêm một góc nhìn' : 'A little more perspective')} · ${card.name}`));
  const depth = selected.length === 10 ? [vietnamese
    ? 'Trải bài Celtic Cross chọn mười lá từ bộ bài đầy đủ 78 lá, gồm Ẩn Chính và bốn bộ Ẩn Phụ, để khám phá hoàn cảnh, ảnh hưởng và hướng đi. Vị trí cuối gợi mở một khả năng, không phải dự đoán.'
    : 'This ten-card Celtic Cross draws from the full 78-card deck, including the Major Arcana and four minor suits, to explore your situation and possible directions. The final position offers a possibility, not a prediction.'] : [];
  const synthesis = selected.length === 10 ? [vietnamese
    ? 'Kết nối các góc nhìn\nSo sánh hoàn cảnh hiện tại với ảnh hưởng giao thoa: hai góc nhìn này bổ sung hay tạo ra căng thẳng cho nhau? Sau đó xem thái độ của bạn và môi trường xung quanh để phân biệt điều bạn có thể tác động với điều cần được hỗ trợ. Hãy xem hướng đi cuối cùng là một điều để khám phá, không phải kết quả đã định.'
    : 'Bringing the perspectives together\nCompare your present situation with the crossing influence: where do these themes support or challenge each other? Then consider your stance alongside your surroundings to separate what you can influence from where support may help. Treat the final direction as something to explore, rather than a fixed outcome.'] : [];
  return join(vietnamese ? [
    'Một khoảng lặng để chiêm nghiệm. Đây là bài đọc hướng dẫn từ ý nghĩa lá bài được lưu sẵn, không phải câu trả lời từ AI trực tiếp.',
    `Giữ câu hỏi của bạn trong tâm trí: “${topic}”`,
    ...depth,
    ...parts,
    ...synthesis,
    `Điều bạn có thể mang theo\n${action}`,
    'Hãy xem những lá bài như một góc nhìn, không phải phán quyết. Giữ lại điều hữu ích và dành chỗ cho nhận định của riêng bạn.',
  ] : [
    'A little space to reflect. This is a guided reading from saved card meanings, rather than a live AI response.',
    `Holding your question in mind: “${topic}”`,
    ...depth,
    ...parts,
    ...synthesis,
    `Something to take with you\n${action}`,
    'Let these cards offer a perspective, not a verdict. Keep what resonates and leave room for your own judgment.',
  ]);
}

const historyEncoder = new TextEncoder();
const historyWireBytes = (value: string) => historyEncoder.encode(JSON.stringify(value).slice(1, -1)).length;

function clipHistoryText(content: string, characterLimit: number, byteLimit: number, fromEnd = false): { text: string; bytes: number } {
  const characters = Array.from(content);
  if (fromEnd) characters.reverse();
  const kept: string[] = [];
  let length = 0;
  let bytes = 0;
  for (const character of characters) {
    const size = historyWireBytes(character);
    if (length + character.length > characterLimit || bytes + size > byteLimit) break;
    kept.push(character);
    length += character.length;
    bytes += size;
  }
  if (fromEnd) kept.reverse();
  return { text: kept.join(''), bytes };
}

function historyExcerpt(role: ReadingHistoryMessage['role'], content: string, byteLimit: number): { text: string; bytes: number } {
  if (role !== 'assistant' || (content.length <= 3_500 && historyWireBytes(content) <= byteLimit)) {
    return clipHistoryText(content, 3_500, byteLimit);
  }
  // Long readings need their ending for follow-ups and "continue" requests.
  // Mark the missing middle explicitly rather than presenting joined text as a complete reply.
  const marker = '\n\n[Middle of earlier reply omitted]\n\n';
  const markerBytes = historyWireBytes(marker);
  if (byteLimit <= markerBytes) return { text: '', bytes: 0 };
  const bodyBudget = byteLimit - markerBytes;
  const head = clipHistoryText(content, 1_400, Math.floor(bodyBudget * 0.4));
  const tail = clipHistoryText(content, 3_500 - marker.length - head.text.length, bodyBudget - head.bytes, true);
  return { text: head.text + marker + tail.text, bytes: head.bytes + markerBytes + tail.bytes };
}

export function boundedHistory(history: ReadingHistoryMessage[] | undefined, question?: string): ReadingHistoryMessage[] | undefined {
  if (!history) return undefined;
  const previous = [...history];
  if (previous.at(-1)?.role === 'user' && previous.at(-1)?.content.trim() === question?.trim()) previous.pop();
  const firstUser = previous.findIndex(message => message.role === 'user');
  const recentStart = Math.max(0, previous.length - 7);
  const indices = [...new Set([...(firstUser >= 0 && firstUser < recentStart ? [firstUser] : []), ...previous.map((_, index) => index).slice(-7)])];
  // Preserve the most recent exchanges within both the per-message character
  // limit and the server's total UTF-8 byte limit, including translated text.
  let remainingBytes = 28_000;
  const anchor = firstUser >= 0 && firstUser < recentStart ? firstUser : undefined;
  const order = [...(anchor === undefined ? [] : [anchor]), ...indices.filter(index => index !== anchor).reverse()];
  const excerpts = new Map<number, ReadingHistoryMessage>();
  for (const index of order) {
    const { role, content } = previous[index];
    const limit = index === anchor ? Math.min(1_800, remainingBytes) : remainingBytes;
    // Account for JSON escapes as well as UTF-8 characters in the wire budget.
    const excerpt = historyExcerpt(role, content, limit);
    remainingBytes -= excerpt.bytes;
    if (excerpt.text.trim()) excerpts.set(index, { role, content: excerpt.text });
  }
  return indices.flatMap(index => excerpts.has(index) ? [excerpts.get(index)!] : []);
}

export async function getReading(input: ReadingRequest): Promise<ReadingResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 82_000);
  const stop = () => controller.abort();
  input.signal?.addEventListener('abort', stop, { once: true });
  if (input.signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw new DOMException('Reply stopped.', 'AbortError');
    const response = await fetch('/api/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: input.question,
        focus: input.focus,
        cardIds: input.cards.map((card) => card.id),
        language: input.language ?? 'en',
        history: boundedHistory(input.history, input.question),
        followUp: input.followUp ?? false,
        continuation: input.continuation ?? /^(please\s+)?(continue|go on|carry on|tiep tuc|viet tiep|hay tiep tuc)[.!?…]*$/i.test(input.question.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
      }),
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    if (controller.signal.aborted) throw new DOMException('Reply stopped.', 'AbortError');
    if (!data || typeof data !== 'object') throw new Error('The reading service returned an unexpected response. Please try again.');
    const result = data as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof result.error === 'string' ? result.error : 'We could not finish your reading. Please try again in a moment.');
    }
    if (result.mode === 'demo') throw new Error('Online AI is not available right now. Your question is kept here. Please try again later.');
    if (result.mode === 'ai' && typeof result.text === 'string' && result.text.trim()) {
      return { text: result.text, mode: 'ai' };
    }
    throw new Error('The reading service returned an incomplete response. Please try again.');
  } catch (error) {
    if (timedOut) throw new Error('Your reading is taking longer than expected. Please try again in a moment.');
    if (input.signal?.aborted) throw new DOMException('Reply stopped.', 'AbortError');
    if (error instanceof TypeError) throw new Error('Online AI could not connect. Check your internet connection and try again. Your question is kept here.');
    if (error instanceof SyntaxError) throw new Error('The reading service is not available here yet. Please try again when it is running.');
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', stop);
  }
}
