import { BookOpen, Sun, Cloud, Compass, ArrowRight } from 'lucide-react';
import { getCardGuidance } from '../data/card-guidance';
import { useLanguage } from '../lib/i18n';
import './CardGuidance.css';

/** The reference is available for new and previously saved cards alike. */
export function CardGuidance({ cardId }: { cardId: number }) {
  const { language, t } = useLanguage();
  const guidance = getCardGuidance(cardId, language);
  const sections = [
    { key: 'meaning' as const, label: 'Meaning', icon: BookOpen },
    { key: 'good' as const, label: 'Good side', icon: Sun },
    { key: 'challenge' as const, label: 'Difficult side', icon: Cloud },
    { key: 'advice' as const, label: 'Advice', icon: Compass },
    { key: 'direction' as const, label: 'Clear direction', icon: ArrowRight },
  ];
  return <div className="card-guidance">
    {language !== 'en' && language !== 'vi' && <p className="guidance-language-note">{t('Card reference details are available in English and Vietnamese.')}</p>}
    {sections.map(({ key, label, icon: Icon }) => <section key={key} className={`guidance-section guidance-${key}`}>
      <h3><Icon size={17} aria-hidden="true"/>{t(label)}</h3>
      <p>{guidance[key]}</p>
    </section>)}
  </div>;
}
