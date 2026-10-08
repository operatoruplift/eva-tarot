export const readingCounts = [0, 1, 3, 5, 10] as const;
export type ReadingCount = typeof readingCounts[number];
export const readingLanguages = ['en', 'vi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'th', 'id', 'hi'] as const;
export type ReadingLanguage = typeof readingLanguages[number];
export const languageNames: Record<ReadingLanguage, string> = { en: 'English', vi: 'Vietnamese', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Simplified Chinese', th: 'Thai', id: 'Indonesian', hi: 'Hindi' };
export const spreadPositions: Record<number, string[]> = {
  0: [],
  1: ['Your reflection'],
  3: ['Where you are', 'What to make room for', 'A possible next step'],
  5: ['What is happening', 'What sits underneath', 'What helps', 'What gets in the way', 'A practical next step'],
  10: ['Your present situation', 'The crossing influence', 'Your foundation', 'The recent past', 'Your conscious hopes', 'A near-term possibility', 'Your stance', 'Your surroundings', 'Hopes and fears', 'A possible direction'],
};
export const spreadLabels: Record<number, string> = { 0: 'Just chat', 1: 'One card', 3: 'Three cards', 5: 'Five cards', 10: 'In-depth reading' };
