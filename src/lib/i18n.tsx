import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { vi } from './locales/vi';
import { additionalLocales } from './locales/additional';
import { cards } from '../data/tarot';
import { tarotVi } from '../data/tarot-vi';

export const languages = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'vi', label: 'Tiếng Việt', locale: 'vi-VN' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
  { code: 'fr', label: 'Français', locale: 'fr-FR' },
  { code: 'de', label: 'Deutsch', locale: 'de-DE' },
  { code: 'pt', label: 'Português', locale: 'pt-BR' },
  { code: 'ja', label: '日本語', locale: 'ja-JP' },
  { code: 'ko', label: '한국어', locale: 'ko-KR' },
  { code: 'zh', label: '中文', locale: 'zh-CN' },
  { code: 'th', label: 'ไทย', locale: 'th-TH' },
  { code: 'id', label: 'Bahasa Indonesia', locale: 'id-ID' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
] as const;
export type Language = typeof languages[number]['code'];
export type Translate = (source: string, values?: Record<string, string | number>) => string;
const isLanguage = (value: unknown): value is Language => languages.some(language => language.code === value);
const vietnamese: Record<string, string> = { ...vi };
for (const card of cards) {
  const translated = tarotVi[card.id];
  vietnamese[card.name] = translated.name;
  vietnamese[card.meaning] = translated.meaning;
  vietnamese[card.reflection] = translated.reflection;
  card.keywords.forEach((keyword, index) => { vietnamese[keyword] = translated.keywords[index]; });
}
export const translations: Record<Language, Record<string, string>> = { en: {}, vi: vietnamese, ...additionalLocales };
export function translate(language: Language, source: string, values?: Record<string, string | number>) {
  const dictionary = translations[language];
  const candidate = Object.hasOwn(dictionary, source) ? dictionary[source] : undefined;
  return (typeof candidate === 'string' && candidate ? candidate : source).replace(/\{(\w+)\}/g, (match, key: string) => values?.[key] === undefined ? match : String(values[key]));
}
function initialLanguage(): Language {
  try { const stored = localStorage.getItem('evara-language'); if (isLanguage(stored)) return stored; } catch { /* Language selection still works when browser storage is unavailable. */ }
  return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
type LanguageContextValue = {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: Translate;
  formatDate: (date: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  storageError: boolean;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(initialLanguage);
  const [storageError, setStorageError] = useState(false);
  const locale = languages.find(item => item.code === language)!.locale;
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = 'ltr'; }, [language]);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === 'evara-language' && isLanguage(event.newValue)) updateLanguage(event.newValue); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const context = useMemo<LanguageContextValue>(() => ({
    language, locale, storageError,
    setLanguage(next) {
      if (!isLanguage(next)) return;
      updateLanguage(next);
      try { localStorage.setItem('evara-language', next); setStorageError(false); } catch { setStorageError(true); }
    },
    t: (source, values) => translate(language, source, values),
    formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date),
  }), [language, locale, storageError]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider.');
  return context;
}

export function LanguageSelector() {
  const { language, setLanguage, t, storageError } = useLanguage();
  return <label className="language-field" htmlFor="app-language"><span className="field-label">{t('Language')}</span><select id="app-language" value={language} onChange={event => setLanguage(event.target.value as Language)}><optgroup label={t('Default languages')}>{languages.slice(0, 2).map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</optgroup><optgroup label={t('More languages')}>{languages.slice(2).map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</optgroup></select><small>{t('English and Vietnamese include card meanings. Other languages translate the main controls; some guidance remains in English.')}</small>{storageError && <small role="alert">{t('This browser could not save your language choice.')}</small>}</label>;
}
