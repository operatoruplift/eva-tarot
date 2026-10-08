import { BookOpen, MessageCircle } from 'lucide-react';
import { Logo } from './Brand';
import { useLanguage } from '../lib/i18n';
import type { MissingReadingReason } from '../lib/routes';
import './RecoveryStates.css';

type Props = {
  reason?: MissingReadingReason;
  onHistory: () => void;
  onNewConversation: () => void;
};

export function MissingReading({ reason = 'missing', onHistory, onNewConversation }: Props) {
  const { t } = useLanguage();
  return <section className="reading-recovery" aria-labelledby="reading-recovery-title">
    <span className="recovery-logo"><Logo size={62}/></span>
    <h1 id="reading-recovery-title">{t(reason === 'invalid' ? 'This link could not be opened.' : 'This conversation isn’t on this device.')}</h1>
    <p>{t('Conversations are saved in the browser where you created them. Open History here, or return to the original browser to find this reading.')}</p>
    <div className="recovery-actions">
      <button className="primary-button" onClick={onHistory}><BookOpen size={18}/>{t('Open History')}</button>
      <button className="secondary-button" onClick={onNewConversation}><MessageCircle size={18}/>{t('Start a conversation')}</button>
    </div>
    <p className="recovery-footnote">{t('If you have an exported backup, you can import it in Profile & settings.')}</p>
  </section>;
}
