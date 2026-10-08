import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, Download, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { Logo } from './Brand';
import { Modal } from './Modal';
import { useLanguage } from '../lib/i18n';
import { LOCAL_AI_MODELS, refreshLocalAIModelCache, removeLocalAIModel, setLocalAIModel, type LocalAIModelKey, type LocalAIState } from '../lib/local-ai';
import './LocalAISetup.css';

type LocalAISetupProps = {
  state: LocalAIState;
  preparing?: boolean;
  startupError?: string;
  onEnable: () => void;
  onCancel: () => void;
  onClose: () => void;
  onReference?: () => void;
  onExplore?: () => void;
};

const readerChoices = [...LOCAL_AI_MODELS].sort((left, right) => Number(right.key === 'light') - Number(left.key === 'light'));

export function LocalAISetup({ state, preparing = false, startupError = '', onEnable, onCancel, onClose, onReference, onExplore }: LocalAISetupProps) {
  const { t } = useLanguage();
  const [actionError, setActionError] = useState('');
  const checking = !state.removing && state.status === 'checking';
  const loading = !state.removing && state.status === 'loading';
  const busy = preparing || checking || loading || !!state.removing || state.status === 'generating';
  const unsupported = state.status === 'unsupported';
  const selected = LOCAL_AI_MODELS.find(model => model.key === state.model) ?? readerChoices[0];
  const progress = Math.max(0, Math.min(1, state.progress));
  const heading = state.status === 'ready' ? 'Your private reader is ready' : 'Set up your private reader';

  useEffect(() => { void refreshLocalAIModelCache(); }, [state.model]);

  const choose = (key: LocalAIModelKey) => {
    try { setLocalAIModel(key); setActionError(''); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not change the reader. Please try again.'); }
  };
  const remove = async () => {
    try { setActionError(''); await removeLocalAIModel(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not remove the reader. Please try again.'); }
  };
  const busyLabel = preparing ? 'Saving your conversation…'
    : checking ? 'Checking your device…'
      : state.removing ? 'Removing the downloaded reader…'
        : state.status === 'generating' ? 'Writing a reply…' : 'Loading your reader…';

  return <Modal title={t(heading)} onClose={onClose} className="ai-setup-modal">
    <div className="ai-setup reader-setup">
      <header className="reader-setup-header">
        <span className="reader-setup-logo"><Logo size={44} /></span>
        <h2>{t(heading)}</h2>
      </header>
      <div className="reader-setup-scroll">
        <p className="reader-setup-intro">{t('Talk through your question with an AI that runs on your device.')}</p>
        {!unsupported && <fieldset className="model-choices" disabled={busy}>
          <legend>{t('Choose your reader')}</legend>
          {readerChoices.map(model => <label key={model.key} className={`model-choice ${state.model === model.key ? 'selected' : ''}`}>
            <input type="radio" name="local-reader" value={model.key} checked={state.model === model.key} onChange={() => choose(model.key)} />
            <span className="model-choice-copy">
              <strong>{t(model.name)}{model.key === 'light' && <em>{t('Recommended')}</em>}</strong>
              <span>{t(model.key === 'light' ? '360 MB · a lighter choice for your device' : 'About 1 GB · more detail, more memory')}</span>
            </span>
          </label>)}
        </fieldset>}
        {!unsupported && <div className="reader-download-note">
          {state.cached ? <Check size={17} /> : <Download size={17} />}
          <span>{t(state.cached ? 'Already downloaded. Ready to load.' : 'One-time download · about {size} MB', { size: selected.downloadMB })}</span>
        </div>}
        <p className="reader-compatibility">{t('Needs a browser with WebGPU and enough memory. Some phones and browsers won’t support it.')}</p>
        {state.selectionWarning && <p className="setup-error" role="status">{t(state.selectionWarning)}</p>}
        {startupError && <p className="setup-error" role="alert">{startupError}</p>}
        {actionError && <p className="setup-error" role="alert">{t(actionError)}</p>}
        {(state.status === 'error' || unsupported) && <p className="setup-error" role="alert">{t(state.detail)}</p>}
        {(preparing || checking || loading || state.removing) && <div className="reader-setup-progress" role="status" aria-live="polite">
          <div><LoaderCircle className="spin" size={17} /><span>{t(busyLabel)}</span>{loading && <strong>{Math.round(progress * 100)}%</strong>}</div>
          {loading && <progress aria-label={t('Reader loading progress')} value={progress} max={1} />}
          <p>{t(preparing ? 'Your reader will start once your latest changes are saved.' : checking ? 'Checking browser support and available storage.' : state.removing ? 'Your conversations stay saved.' : 'Keep this page open. The first download can take a few minutes.')}</p>
        </div>}
        {state.status === 'generating' && <p className="setup-error" role="status">{t('Another reply is still being written. Wait for it to finish, or stop it before starting this question.')}</p>}
        {unsupported && <p className="reader-setup-intro">{t('You can still explore all 78 cards and return to your saved history.')}</p>}
        <details className="reader-setup-details">
          <summary>{t('Privacy & download settings')}<ChevronDown size={17} /></summary>
          <div>
            <p><ShieldCheck size={16} />{t('Your messages stay on this device.')}</p>
            <p>{t('No subscription or AI API key needed.')}</p>
            <p>{t('The model is downloaded from Hugging Face and MLC. Your chat text is not sent to them.')}</p>
            <p>{t('Voice dictation may use your browser’s online speech service.')}</p>
            <p>{t('Local AI can make mistakes. Use readings as reflection, not predictions.')}</p>
            <button type="button" disabled={busy} className="text-button remove-reader" onClick={() => void remove()}><Trash2 size={16} />{t('Clear this reader’s download')}</button>
            <p>{t('Clears complete or partial downloads for the selected reader. Your conversations and other downloads stay saved.')}</p>
          </div>
        </details>
      </div>
      <footer className="reader-setup-actions">
        {unsupported ? onExplore && <button type="button" className="primary-button" onClick={onExplore} disabled={busy}><BookOpen size={18} />{t('Explore the card library')}</button>
          : <button type="button" className="primary-button" onClick={onEnable} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : state.status === 'ready' ? <ArrowRight size={18} /> : <Download size={18} />}
            {busy ? t(busyLabel) : t(state.status === 'ready' ? 'Continue conversation' : state.cached ? 'Load reader & continue' : 'Download & start · {size} MB', { size: selected.downloadMB })}
          </button>}
        {(preparing || checking || loading || state.status === 'generating') && <button type="button" className="text-button" onClick={onCancel}>{t(state.status === 'generating' ? 'Stop current reply' : 'Cancel setup')}</button>}
        {onReference && <button type="button" className="text-button reference-choice" disabled={busy} onClick={onReference}>{t('Read card meanings without AI')}</button>}
        {!onReference && !busy && !unsupported && <span className="reader-setup-reassurance"><ShieldCheck size={14} />{t('Your messages stay on this device.')}</span>}
      </footer>
    </div>
  </Modal>;
}
