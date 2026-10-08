import { ArrowRight, Check, Cloud, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';
import { useLanguage } from '../lib/i18n';
import type { ReaderMode } from '../lib/reader-mode';

export function ReaderOptions({ mode, onChoose, onClose }: { mode: ReaderMode; onChoose: (mode: ReaderMode) => void; onClose: () => void }) {
  const { t } = useLanguage();
  return <Modal title={t('Reader options')} onClose={onClose}><div className="reader-options">
    <h2>{t('A reader that works for you.')}</h2>
    <button className="reader-option" onClick={() => onChoose('online')}>
      <Cloud size={23}/><span><strong>{t('Online AI')} <em>{t('Recommended')}</em></strong><small>{t('No download. Works without WebGPU. Requires internet.')}</small></span>{mode === 'online' ? <Check size={19}/> : <ArrowRight size={19}/>}
    </button>
    <p>{t('Online AI sends this conversation and its cards to Eva’s server and AI provider to write your reply. Your journal still saves on this device.')}</p>
    <button className="reader-option" onClick={() => onChoose('local')}>
      <ShieldCheck size={23}/><span><strong>{t('On-device AI · experimental')}</strong><small>{t('An optional download for compatible devices. Some phones may run out of memory.')}</small></span>{mode === 'local' ? <Check size={19}/> : <ArrowRight size={19}/>}
    </button>
    <p>{t('On-device AI keeps chat text on this device. Choose it only if your browser and device can run it.')}</p>
  </div></Modal>;
}

export function OnlineDisclosure({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  const { t } = useLanguage();
  return <Modal title={t('Continue with Online AI?')} onClose={onClose}><div className="reader-options online-disclosure">
    <Cloud size={30}/><h2>{t('A reply without the download.')}</h2>
    <p>{t('Your question, selected cards, and relevant messages in this conversation will be sent to Eva’s server and AI provider to generate a response. This includes earlier on-device replies in this conversation.')}</p>
    <p>{t('Your other conversations, profile photo, and calendar notes are not sent. Your journal stays saved in this browser; this does not turn on cloud backup.')}</p>
    <button className="primary-button" onClick={onContinue}>{t('Continue with Online AI')}<ArrowRight size={18}/></button>
    <button className="text-button" onClick={onClose}>{t('Keep my question here')}</button>
  </div></Modal>;
}
