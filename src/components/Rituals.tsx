import { useLanguage } from '../lib/i18n';
import { ArrowRight, BriefcaseBusiness, Compass, Heart, Leaf, MessageCircle, Sparkles, Sun, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Logo } from './Brand';
import { CardBack } from './TarotCards';
import { dateKey, normalizeDayKey } from '../lib/calendar';

export const topics: { name: string; label: string; description: string; icon: LucideIcon; prompt: string; className: string }[] = [
  { name: 'Love & connection', label: 'Love', description: 'Connect a little deeper', icon: Heart, prompt: 'How can I invite more meaningful connection into my life?', className: 'rose' },
  { name: 'Work & purpose', label: 'Work', description: 'Find your next step', icon: BriefcaseBusiness, prompt: 'What could help me feel more aligned in my work?', className: 'sand' },
  { name: 'Personal growth', label: 'Growth', description: 'Make room for you', icon: Leaf, prompt: 'What part of myself is ready to grow?', className: 'sage' },
  { name: 'A little direction', label: 'Direction', description: 'See a new possibility', icon: Compass, prompt: 'What would be helpful for me to reflect on right now?', className: 'lilac' },
];


export function WeekStrip({ days }: { days: string[] }) {
  const { t, formatDate } = useLanguage();
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - (now.getDay() + 6) % 7);
  return (
    <div className="week-strip" aria-label={t("Your week of little moments")}>
      {Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        const today = dateKey(day) === dateKey(now);
        const practiced = days.some(value => normalizeDayKey(value) === dateKey(day));
        return (
          <div key={index} className={`week-day ${today ? 'is-today' : ''}`} aria-current={today ? 'date' : undefined}>
            <span>{formatDate(day, { weekday: 'short' })}</span>
            <strong>{day.getDate()}</strong>
            <i className={practiced ? 'has-moment' : ''} aria-label={practiced ? t('Reflection completed') : undefined} />
          </div>
        );
      })}
    </div>
  );
}

type HomeProps = {
  hasDaily: boolean;
  days: string[];
  onDaily: () => void;
  onRead: () => void;
  onBreathe: () => void;
  onExplore: () => void;
  onTopic: (topic: typeof topics[number]) => void;
};

export function TodayScreen({ hasDaily, days, onDaily, onRead, onBreathe, onExplore, onTopic }: HomeProps) {
  const { t } = useLanguage();
  return (
    <div className="home-content screen-enter">
      <WeekStrip days={days} />
      <section className="daily-feature" aria-labelledby="daily-title">
        <div className="daily-copy">
          <div className="daily-eyebrow"><Sun size={16} /> {t("YOUR DAILY RITUAL")}</div>
          <h1 id="daily-title">{t("A little clarity.")}<br /><em>{t("A lighter day.")}</em></h1>
          <p>{t("Pause, pick a card, and see")}<br />{t("what opens up for you.")}</p>
          <button className="primary-button" onClick={onDaily}>{t(hasDaily ? 'Revisit my card' : 'Draw my daily card')}<ArrowRight size={18} /></button>
          <span className="ritual-time">{t("One card · 2 minutes · Just for you")}</span>
        </div>
        <div className="daily-art" aria-hidden="true">
          <div className="sun-halo" /><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" />
          <CardBack className="hero-card hero-back" />
          <div className="hero-card hero-front"><img src="/cards/the-sun.jpg" alt="" /><span>{t("THE SUN")}</span></div>
          <span className="art-spark sparkle-one">✦</span><span className="art-spark sparkle-two">✧</span>
          <svg className="hero-botanical" viewBox="0 0 120 190" fill="none"><path d="M26 181C47 129 39 90 81 25M46 124C11 106 5 78 14 60C41 72 52 98 46 124ZM53 99C84 92 104 67 98 44C68 50 53 70 53 99ZM70 55C45 45 43 24 49 10C71 21 75 35 70 55Z" stroke="currentColor" strokeWidth="1.5" /></svg>
        </div>
      </section>
      <button className="ask-banner" onClick={onRead}>
        <span className="ask-orb"><MessageCircle size={23} strokeWidth={1.6} /><i>✧</i></span>
        <span><strong>{t("Something on your mind?")}</strong><small>{t("Let’s explore it together.")}</small></span><ArrowRight size={20} />
      </button>
      <section className="focus-section">
        <div className="section-heading"><h2>{t("A space for every feeling")}</h2><span>{t("Start here")}</span></div>
        <div className="topic-grid">
          {topics.map(topic => (
            <button className={`topic-button ${topic.className}`} key={topic.name} onClick={() => onTopic(topic)}>
              <span className="topic-illustration"><topic.icon size={30} strokeWidth={1.4} /><i className="topic-spark">✧</i><i className="topic-dot" /></span>
              <strong>{t(topic.label)}</strong><small>{t(topic.description)}</small><ArrowRight className="topic-arrow" size={17} />
            </button>
          ))}
        </div>
      </section>
      <section className="small-rituals">
        <button className="breathe-banner" onClick={onBreathe}><span className="mini-lotus"><Logo size={46} /></span><span><strong>{t("First, a soft breath.")}</strong><small>{t("A 30-second reset for your day")}</small></span><Wind size={22} /></button>
        <button className="explore-link" onClick={onExplore}><Sparkles size={18} /><span>{t("Get to know the cards")}</span><ArrowRight size={18} /></button>
      </section>
      <p className="home-whisper">{t("A little perspective. Your own way forward.")}</p>
    </div>
  );
}

export function ReadScreen({ focus, spread, onSpread, onTopic }: { focus: string; spread: number; onSpread: (value: number) => void; onTopic: (topic: typeof topics[number]) => void }) {
  const { t } = useLanguage();
  return (
    <div className="read-content screen-enter">
      <span className="read-lotus"><Logo size={75} /></span>
      <span className="eyebrow">{t("A CONVERSATION WITH YOURSELF")}</span>
      <h1>{t("What’s on")}<br /><em>{t("your heart?")}</em></h1>
      <p>{t("Bring a question, a feeling, or a little curiosity.")}<br />{t("We’ll find a fresh perspective together.")}</p>
      <div className="read-topics" aria-label={t("Choose a focus")}>
        {topics.map(topic => <button key={topic.name} className={focus === topic.name ? 'selected' : ''} onClick={() => onTopic(topic)}><topic.icon size={17} />{t(topic.label)}</button>)}
      </div>
      <fieldset className="spread-picker"><legend>{t("How would you like to reflect?")}</legend>
        <button type="button" className={spread === 1 ? 'selected' : ''} onClick={() => onSpread(1)} aria-pressed={spread === 1}><span className="spread-icon one">▯</span><span><strong>{t("A little insight")}</strong><small>{t("1 card · a simple starting point")}</small></span><span className="radio-dot" /></button>
        <button type="button" className={spread === 3 ? 'selected' : ''} onClick={() => onSpread(3)} aria-pressed={spread === 3}><span className="spread-icon">▯▯▯</span><span><strong>{t("A fresh perspective")}</strong><small>{t("3 cards · room to go deeper")}</small></span><span className="radio-dot" /></button>
        <button type="button" className={spread === 10 ? 'selected' : ''} onClick={() => onSpread(10)} aria-pressed={spread === 10}><span className="spread-icon">✧</span><span><strong>{t('In-depth reading')}</strong><small>{t('10 cards · a fuller picture')}</small></span><span className="radio-dot" /></button>
        <button type="button" className={spread === 0 ? 'selected' : ''} onClick={() => onSpread(0)} aria-pressed={spread === 0}><span className="spread-icon"><MessageCircle size={24}/></span><span><strong>{t('Just chat')}</strong><small>{t('No cards · a space to talk')}</small></span><span className="radio-dot" /></button>
      </fieldset>
    </div>
  );
}
