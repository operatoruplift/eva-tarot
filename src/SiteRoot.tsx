import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Brand } from './components/Brand';
import ReadingApp from './App';
import { siteSurface } from './lib/site-routes';
import { legacyPathHash } from './lib/routes';
import { readReaderReturn, rememberReaderReturn, validReaderReturnHash } from './lib/reader-return';
import { CONNECTION_EVENT, CONNECTION_KEY, personalScope } from './lib/account-connection';
import './site.css';

const Pricing = lazy(() => import('./components/CommercePage').then(module => ({ default: module.CommercePage })));
const Admin = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
type SiteContent = { hero_title_en?: string; hero_title_vi?: string; hero_description_en?: string; hero_description_vi?: string; support_email?: string };

function Opening() { return <div className="site-opening" role="status"><Brand /><span>Eva Tarot</span></div>; }
function readScope() {
  try { return { scope: personalScope(), error: '' }; }
  catch { return { scope: undefined, error: 'Your private connection could not be opened. Allow site storage and retry. Keep existing site data; do not clear it.' }; }
}

export default function SiteRoot() {
  const [surface, setSurface] = useState(() => siteSurface(location.hash, location.pathname));
  const [appStarted, setAppStarted] = useState(() => surface === 'app');
  const lastReaderHash = useRef(surface === 'app' ? validReaderReturnHash(location.hash || legacyPathHash(location.pathname) || '#chat') || readReaderReturn() : readReaderReturn());
  const [content, setContent] = useState<SiteContent>();
  const [accountNotice, setAccountNotice] = useState('');
  const [connection, setConnection] = useState(readScope);
  const readerScope = connection.scope;
  useEffect(() => {
    const changed = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== CONNECTION_KEY && event.key !== null) return;
      setConnection(readScope());
    };
    addEventListener(CONNECTION_EVENT, changed); addEventListener('storage', changed);
    return () => { removeEventListener(CONNECTION_EVENT, changed); removeEventListener('storage', changed); };
  }, []);
  const rememberActiveReader = () => {
    const hash = validReaderReturnHash(location.hash || legacyPathHash(location.pathname) || '#chat');
    if (hash) { lastReaderHash.current = hash; rememberReaderReturn(hash); }
  };
  useEffect(() => {
    const changed = () => {
      const next = siteSurface(location.hash, location.pathname);
      if (next === 'app') { setAppStarted(true); rememberActiveReader(); }
      setSurface(next);
    };
    if (siteSurface(location.hash, location.pathname) === 'app') rememberActiveReader();
    addEventListener('hashchange', changed); addEventListener('popstate', changed);
    return () => { removeEventListener('hashchange', changed); removeEventListener('popstate', changed); };
  }, []);
  useEffect(() => {
    if (surface === 'app' || surface === 'admin') return;
    const controller = new AbortController();
    void fetch('/api/commerce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'catalog' }), signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(result => { if (result?.catalog?.settings && !controller.signal.aborted) setContent(result.catalog.settings); })
      .catch(() => { /* The public introduction remains readable while commerce is unavailable. */ });
    return () => controller.abort();
  }, [surface]);
  useEffect(() => {
    if (surface === 'admin') return;
    void fetch('/api/commerce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track_event', name: 'page_view', page: surface }), keepalive: true }).catch(() => {});
    if(surface === 'pricing') void fetch('/api/commerce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track_event', name: 'pricing_view', page: 'pricing' }), keepalive: true }).catch(() => {});
  }, [surface]);
  const go = (hash: string) => { location.hash = hash; window.scrollTo({ top: 0 }); };
  const resumeReader = () => go(lastReaderHash.current.replace(/^#/, ''));
  return <>
    {accountNotice && <div className="account-global-notice" role="alert"><p>{accountNotice}</p><button onClick={()=>setAccountNotice('')} aria-label="Dismiss account notice">×</button></div>}
    <Suspense fallback={<Opening />}>
      {surface === 'landing' && <LandingPage onStart={() => go('chat')} onPricing={() => go('pricing')} onDonate={() => go('support')} content={content} />}
      {surface === 'pricing' && <Pricing key={readerScope ?? 'guest-legacy'} onStart={resumeReader} onHome={() => go('welcome')} />}
      {surface === 'support' && <Pricing key={readerScope ?? 'guest-legacy'} donationOnly onStart={resumeReader} onHome={() => go('welcome')} />}
      {surface === 'admin' && <Admin onHome={() => go('welcome')} />}
      {/* Preserve an active reader while visiting pricing; its response can still save. */}
      {appStarted && <div className="site-reader" hidden={surface !== 'app'}>{connection.error ? <main className="site-opening" role="alert"><Brand/><p>{connection.error}</p><button className="secondary-button" onClick={() => setConnection(readScope())}>Retry storage access</button><a href="#welcome">Explore Eva Tarot</a></main> : <ReadingApp key={readerScope ?? 'guest-legacy'} personalDataScope={readerScope} onLeaveReader={rememberActiveReader} onAccountNotice={setAccountNotice} />}</div>}
    </Suspense>
  </>;
}
