import { useId } from 'react';
import { useLanguage } from '../lib/i18n';
import './ReferenceContextAction.css';

type ReferenceContextActionProps = {
  onPersonalize: () => void;
  disabled?: boolean;
};

export function ReferenceContextAction({ onPersonalize, disabled = false }: ReferenceContextActionProps) {
  const { t } = useLanguage();
  const noteId = useId();

  return <div className="reference-context-action">
    <p id={noteId}>{t('These are general card notes. A personal reflection uses what you have shared in the chat.')}</p>
    <button type="button" onClick={onPersonalize} disabled={disabled} aria-describedby={noteId}>
      {t('Reflect on my situation')}
    </button>
  </div>;
}
