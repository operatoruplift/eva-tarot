import { Component, type ReactNode } from 'react';
import { Home, RefreshCw } from 'lucide-react';
import { Logo } from './Brand';
import { useLanguage } from '../lib/i18n';
import './RecoveryStates.css';

function RecoveryScreen() {
  const { t } = useLanguage();
  function openHome() {
    window.history.replaceState(null, '', '/#chat');
    window.location.reload();
  }
  return <main className="app-recovery">
    <section className="reading-recovery" aria-labelledby="app-recovery-title">
      <span className="recovery-logo"><Logo size={62}/></span>
      <h1 id="app-recovery-title">{t('Eva couldn’t open this screen.')}</h1>
      <p role="alert">{t('Please reopen the app. These buttons do not clear your saved conversations or downloaded files.')}</p>
      <div className="recovery-actions">
        <button className="primary-button" onClick={() => window.location.reload()}><RefreshCw size={18}/>{t('Reload Eva')}</button>
        <button className="secondary-button" onClick={openHome}><Home size={18}/>{t('Return to chat')}</button>
      </div>
    </section>
  </main>;
}

/** Keep recovery outside the failed App subtree without exposing private error content. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() { return this.state.failed ? <RecoveryScreen/> : this.props.children; }
}
