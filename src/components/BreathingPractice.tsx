import { useLanguage } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Pause, Play, RotateCcw, Volume2, VolumeX, Wind } from 'lucide-react';
import { Logo } from './Brand';

type Props = { onComplete: () => void; onHome: () => void };

export function BreathingPractice({ onComplete, onHome }: Props) {
  const { t } = useLanguage();
  const [duration, setDuration] = useState(30);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState('');
  const [complete, setComplete] = useState(false);
  const bellSnapshot = useRef<() => void>(() => {});
  const orb = useRef<HTMLDivElement>(null);
  const frozenTransforms = useRef<string[]>([]);
  const clock = useRef({ started: 0, saved: 0 });
  const audio = useRef<AudioContext | null>(null);
  const completion = useRef(onComplete);
  completion.current = onComplete;
  const seconds = Math.floor(elapsed);
  const inCycle = seconds % 10;
  const inhale = inCycle < 4;
  const count = inhale ? 4 - inCycle : 10 - inCycle;
  const remaining = Math.max(0, duration - seconds);

  function bell() {
    if (!audio.current) return;
    try {
      const context = audio.current;
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = 528;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.11, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.8);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 1.8);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { setSoundError('Sound isn’t available in this browser. Follow the circle instead.'); setSound(false); }
  }

  bellSnapshot.current = () => { if (sound) bell(); };

  useEffect(() => {
    if (!running) return;
    clock.current.started = performance.now();
    const interval = window.setInterval(() => {
      const next = Math.min(duration, clock.current.saved + (performance.now() - clock.current.started) / 1000);
      setElapsed(next);
      if (next >= duration) {
        clearInterval(interval);
        setRunning(false); setComplete(true);
        clock.current.saved = duration;
        completion.current();
        bellSnapshot.current();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [running, duration]);

  useEffect(() => {
    if (sound && running && seconds % 10 === 0) bell();
  }, [seconds, sound, running]);

  useEffect(() => () => { void audio.current?.close(); }, []);

  function clearFrozenTransforms() {
    orb.current?.querySelectorAll<HTMLElement>('.breath-center, .breath-petal').forEach(element => {
      element.style.removeProperty('transform'); element.style.removeProperty('transition');
    });
  }
  function resume() {
    clearFrozenTransforms();
    setRunning(true);
  }
  function pause() {
    const shapes = Array.from(orb.current?.querySelectorAll<HTMLElement>('.breath-center, .breath-petal') || []);
    frozenTransforms.current = shapes.map(element => getComputedStyle(element).transform);
    shapes.forEach((element, index) => { element.style.transform = frozenTransforms.current[index]; element.style.transition = 'none'; });
    clock.current.saved = Math.min(duration, clock.current.saved + (performance.now() - clock.current.started) / 1000);
    setElapsed(clock.current.saved); setRunning(false);
  }
  function reset(nextDuration = duration) {
    clearFrozenTransforms();
    setRunning(false); setComplete(false); setElapsed(0); setDuration(nextDuration);
    clock.current = { started: 0, saved: 0 };
  }
  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      if (!audio.current) audio.current = new AudioContext();
      await audio.current.resume();
      setSound(true); setSoundError(''); if (!running) bell();
    } catch { setSoundError('Sound isn’t available in this browser. Follow the circle instead.'); }
  }

  return (
    <div className={`breathing-content screen-enter ${running ? 'practice-running' : ''}`}>
      <span className="eyebrow">{t("A LITTLE ROOM TO JUST BE")}</span>
      <h1>{t(complete ? 'You made space.' : 'Come back to you.')}</h1>
      <p>{t(complete ? 'Carry this softer feeling into whatever comes next.' : 'A gentle breath in. A little more space out.')}</p>
      <div className="duration-picker" aria-label={t("Practice duration")}>{[30, 60, 180].map(value => <button key={value} disabled={running} onClick={() => reset(value)} aria-pressed={duration === value} className={duration === value ? 'selected' : ''}>{t(value < 60 ? '{count} sec' : '{count} min', { count: value < 60 ? value : value / 60 })}</button>)}</div>
      <div ref={orb} className={`breath-orb ${running ? (inhale ? 'inhale' : 'exhale') : ''} ${complete ? 'complete' : ''}`}>
        <span className="breath-ring ring-outer" /><span className="breath-ring ring-inner" /><span className="breath-petal petal-one" /><span className="breath-petal petal-two" /><span className="breath-petal petal-three" />
        <div className="breath-center"><Logo size={77} /><strong>{t(complete ? 'Beautiful.' : running ? (inhale ? 'Breathe in' : 'Breathe out') : elapsed > 0 ? 'Take your time' : 'Let’s slow down')}</strong><span>{complete ? <Check size={24} /> : running ? count : <Wind size={23} />}</span></div>
      </div>
      <div className="practice-caption" aria-live="polite"><span>{t(complete ? 'A moment, just for you' : running ? (inhale ? 'Gently fill with air' : 'Let your shoulders soften') : 'In for 4 · out for 6 · follow your own comfort')}</span></div>
      <div className="practice-timer"><span>{`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span><small>{t(complete ? 'You did it' : elapsed > 0 && !running ? 'Paused' : 'remaining')}</small></div>
      {complete ? <div className="practice-actions"><button className="primary-button" onClick={onHome}>{t("Back to my day")}<ArrowRight size={18} /></button><button className="text-button" onClick={() => reset()}>{t("Take another moment")}</button></div> : <div className="practice-actions"><button className="icon-button practice-reset" aria-label={t("Reset breathing practice")} onClick={() => reset()}><RotateCcw size={21} /></button><button className="primary-button" onClick={running ? pause : resume}>{running ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}{t(running ? 'Pause' : elapsed > 0 ? 'Keep going' : 'Begin breathing')}</button><button className={`icon-button practice-sound ${sound ? 'enabled' : ''}`} aria-label={t(sound ? 'Turn bell sound off' : 'Turn bell sound on')} aria-pressed={sound} onClick={() => void toggleSound()}>{sound ? <Volume2 size={21} /> : <VolumeX size={21} />}</button></div>}
      {soundError && <p role="status" className="sound-error">{t(soundError)}</p>}
      <p className="practice-footnote">{t("No perfect way to do this. Just your next breath.")}</p>
    </div>
  );
}
