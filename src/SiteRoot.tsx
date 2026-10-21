import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Brand } from './components/Brand';
import ReadingApp from './App';
import { siteSurface } from './lib/site-routes';
import { legacyPathHash } from './lib/routes';
import './site.css';

const Pricing = lazy(() => import('./components/CommercePage').then(module => ({ default: module.CommercePage })));
const Admin = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
type SiteContent = { hero_title_en?: string; hero_title_vi?: string; hero_description_en?: string; hero_description_vi?: string; support_email?: string };

function Opening() { return <div className="site-opening" role="status"><Brand /><span>Eva Tarot</span></div>; }

export default function SiteRoot() {
  const [surface, setSurface] = useState(() => siteSurface(location.hash, location.pathname));
  const [appStarted, setAppStarted] = useState(() => surface === 'app');
  const lastReaderHash = useRef(surface === 'app' ? location.hash || legacyPathHash(location.pathname) || '#chat' : '#chat');
  const [content, setContent] = useState<SiteContent>();
  useEffect(() => {
    const changed = () => {
      const next = siteSurface(location.hash, location.pathname);
      if (next === 'app') { setAppStarted(true); lastReaderHash.current = location.hash || '#chat'; }
      setSurface(next);
    };
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
    <Suspense fallback={<Opening />}>
      {surface === 'landing' && <LandingPage onStart={() => go('chat')} onPricing={() => go('pricing')} onDonate={() => go('support')} content={content} />}
      {surface === 'pricing' && <Pricing onStart={resumeReader} onHome={() => go('welcome')} />}
      {surface === 'support' && <Pricing donationOnly onStart={resumeReader} onHome={() => go('welcome')} />}
      {surface === 'admin' && <Admin onHome={() => go('welcome')} />}
      {/* Preserve an active reader while visiting pricing; its response can still save. */}
      {appStarted && <div className="site-reader" hidden={surface !== 'app'}><ReadingApp onLeaveReader={() => { lastReaderHash.current = location.hash || '#chat'; }} /></div>}
    </Suspense>
  </>;
}
