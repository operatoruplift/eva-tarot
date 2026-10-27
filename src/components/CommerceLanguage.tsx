import { Globe2 } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

export function CommerceLanguage() {
  const { language, setLanguage } = useLanguage();
  const vi = language === 'vi';
  return <button type="button" className="commerce-language" aria-label={vi ? 'Switch to English' : 'Chuyển sang tiếng Việt'} onClick={() => setLanguage(vi ? 'en' : 'vi')}><Globe2 size={15} aria-hidden="true" /><span lang="en" className={vi ? undefined : 'is-current'}>EN</span><span aria-hidden="true">/</span><span lang="vi" className={vi ? 'is-current' : undefined}>VI</span></button>;
}
