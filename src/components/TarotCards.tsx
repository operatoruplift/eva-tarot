import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, Check, Hand, RefreshCw, Sparkles } from 'lucide-react';
import type { TarotCard } from '../data/tarot';
import { Logo } from './Brand';
import { SoftSelect } from './SoftSelect';
import { useLanguage } from '../lib/i18n';
import { spreadPositions, spreadLabels } from '../data/spreads';
import './TarotCards.css';

export function CardBack({ className = '' }: { className?: string }) {
  return <div className={`card-back ${className}`}><div className="card-back-border"><span className="card-corner tl">✧</span><span className="card-corner br">✧</span><Logo size={54} /><span className="back-wordmark">eva tarot</span><span className="card-back-dots">· &nbsp; ✧ &nbsp; ·</span></div></div>;
}

type DeckProps = {
  count: number;
  deck: TarotCard[];
  selected: number[];
  onSelect: (index: number) => void;
  onReveal: () => void;
  onAuto?: () => void;
  onCountChange?: (count: number) => void;
  onShuffle?: () => void;
};
type ShuffleAction = 'automatic' | 'manual';

export function CardDeck({ count, deck, selected, onSelect, onReveal, onAuto, onCountChange, onShuffle }: DeckProps) {
  const { t } = useLanguage();
  const [manual, setManual] = useState(false);
  const [shuffling, setShuffling] = useState<ShuffleAction | null>(null);
  const actionLocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onAuto, onReveal, onShuffle });
  // A shuffle replaces the deck in the parent. Use its latest reveal callback,
  // rather than the old deck captured when the animation began.
  useLayoutEffect(() => { callbacks.current = { onAuto, onReveal, onShuffle }; }, [onAuto, onReveal, onShuffle]);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  const startShuffle = (action: ShuffleAction) => {
    if (actionLocked.current || (action === 'automatic' && !callbacks.current.onAuto)) return;
    actionLocked.current = true;
    callbacks.current.onShuffle?.();
    setManual(action === 'manual');
    setShuffling(action);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (action === 'automatic') {
        // Keep the lock until the parent replaces the picker with the reading.
        callbacks.current.onAuto?.();
      } else {
        actionLocked.current = false;
        setShuffling(null);
      }
    }, reducedMotion ? 80 : 1180);
  };
  const revealSelected = () => {
    if (actionLocked.current || selected.length !== count) return;
    actionLocked.current = true;
    callbacks.current.onReveal();
  };

  return <section className={`simple-draw-panel tarot-draw-panel screen-enter ${shuffling ? 'is-shuffling' : ''}`} aria-busy={Boolean(shuffling)}>
    <div className="lotus-shuffle-stage" aria-hidden="true">
      <div className="shuffle-halo"/>
      {[0, 1, 2, 3, 4].map(index => <div className="shuffle-card" key={index} style={{ '--fan-x': `${(index - 2) * 22}px`, '--fan-turn': `${(index - 2) * 10}deg`, '--mix-x': `${(index % 2 ? -1 : 1) * (35 + index * 2)}px`, '--mix-turn': `${(index % 2 ? -1 : 1) * 23}deg`, '--shuffle-delay': `${index * 35}ms` } as CSSProperties}><CardBack/></div>)}
      <span className="shuffle-glint glint-one">✧</span><span className="shuffle-glint glint-two">✦</span>
    </div>
    <span className="draw-eyebrow">{t('A MOMENT FOR YOU')}</span>
    <h2>{t(shuffling ? 'Shuffling your deck…' : manual ? 'Choose what calls to you.' : 'Ready when you are.')}</h2>
    <p>{t(shuffling ? 'A fresh shuffle. A little room for possibility.' : manual ? 'Tap a card to choose it. Tap again to change your mind.' : 'All 78 cards are in the shuffle. Take a breath, then draw.')}</p>
    {onCountChange && <div className="draw-spread-choice"><span>{t('Your spread')}</span><SoftSelect aria-label={t('Number of cards')} value={count} onChange={onCountChange} disabled={Boolean(shuffling)} options={[1, 3, 5, 10].map(value => ({ value, label: `${t(spreadLabels[value])} · ${value}` }))}/></div>}
    <button type="button" className="primary-button draw-primary" disabled={Boolean(shuffling) || !onAuto} onClick={() => startShuffle('automatic')}><Sparkles size={18}/>{t(shuffling === 'automatic' ? 'Shuffling your deck…' : 'Draw {count} cards', { count })}</button>
    <button type="button" className="text-button manual-draw-toggle" disabled={Boolean(shuffling)} aria-expanded={manual} onClick={() => { if (manual) setManual(false); else startShuffle('manual'); }}><Hand size={16}/>{t(manual ? 'Hide manual selection' : 'Or pick the cards yourself')}</button>
    {manual && <div className="lotus-manual-draw">
      <div className="manual-deck-toolbar"><span className="selection-count" role="status"><Check size={15}/>{t('{selected} of {count} chosen', { selected: selected.length, count })}</span>{onShuffle && <button type="button" className="reshuffle-button" disabled={Boolean(shuffling)} onClick={() => startShuffle('manual')}><RefreshCw size={14}/>{t('Shuffle again')}</button>}</div>
      {shuffling ? <div className="manual-shuffle-wait" role="status">{t('Your cards will be ready in a moment…')}</div> : <div className="lotus-selection-deck" role="group" aria-label={t('Choose {count} cards', { count })}>
        {deck.map((card, index) => <button type="button" className={`lotus-pick-card ${selected.includes(index) ? 'is-selected' : ''}`} key={card.id} aria-pressed={selected.includes(index)} aria-label={t('Select card {number}', { number: index + 1 })} disabled={!selected.includes(index) && selected.length >= count} onClick={() => { if (!actionLocked.current) onSelect(index); }} style={{ '--deal-delay': `${(index % 14) * 16}ms` } as CSSProperties}>
          <span className="pick-card-art" aria-hidden="true"><CardBack/></span>
          {selected.includes(index) && <span className="pick-card-check" aria-hidden="true"><Check size={14}/></span>}
        </button>)}
      </div>}
      <div className="manual-reveal-footer"><span>{t('All 78 cards, waiting for your choice.')}</span><button type="button" className="primary-button" disabled={Boolean(shuffling) || selected.length !== count} onClick={revealSelected}>{t('Reveal my cards')}<ArrowRight size={16}/></button></div>
    </div>}
  </section>;
}

export function DrawnCards({ cards, onDetail }: { cards: TarotCard[]; onDetail: (card: TarotCard) => void }) {
  const {t} = useLanguage();
  return (
    <div className="revealed-spread"><div className={`drawn-cards count-${cards.length}`}>
      {cards.map((card, index) => (
        <button key={card.id} className="revealed-card" onClick={() => onDetail(card)} style={{ '--reveal-delay': `${index * 160}ms` } as CSSProperties}>
          <span className="card-position">{t(spreadPositions[cards.length]?.[index] || 'Your reflection')}</span>
          <div className="card-flip-shell"><div className="card-flip-inner"><div className="card-flip-back"><CardBack /></div><div className="card-image-frame"><img src={card.image} alt={`${t(card.name)}, Rider–Waite–Smith`} /></div></div></div>
          <strong>{t(card.name)}</strong><span className="card-keyword">{card.keywords.slice(0, 2).map(keyword=>t(keyword)).join(' · ')}</span><span className="card-learn">{t('Meet this card')}<ArrowRight size={13} /></span>
        </button>
      ))}
    </div><p className="card-detail-hint"><Hand size={14}/>{t('Tap a card for its meaning, both sides and a clear next step.')}</p></div>
  );
}
