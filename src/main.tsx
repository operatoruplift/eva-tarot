import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './lib/i18n';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './styles.css';
import './conversation.css';
import './eva.css';
import './public-release.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageProvider><AppErrorBoundary><App /></AppErrorBoundary></LanguageProvider></React.StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(console.error); });
}
