import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: ((event: {error: string}) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & {SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition};

export function VoiceInput({disabled, onTranscript, onMessage}: {disabled: boolean; onTranscript: (text: string) => void; onMessage: (text: string) => void}) {
  const { t, locale } = useLanguage();
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const starting = useRef(false);
  const latest = useRef({onTranscript,onMessage,t}); latest.current = {onTranscript,onMessage,t};
  useEffect(() => () => { const current = recognition.current; if (current) { current.onend = null; current.onerror = null; current.onresult = null; current.abort(); } }, []);
  useEffect(() => { if (disabled) recognition.current?.abort(); }, [disabled]);
  function toggle() {
    if (listening || starting.current) { recognition.current?.stop(); return; }
    const surface = window as SpeechWindow;
    const Constructor = surface.SpeechRecognition || surface.webkitSpeechRecognition;
    if (!Constructor) { onMessage(t('Voice input is not supported here. Use your keyboard microphone or type your message.')); return; }
    const engine = new Constructor(); recognition.current = engine;
    engine.lang = locale; engine.continuous = false; engine.interimResults = false;
    engine.onresult = event => {
      const words = Array.from(event.results).map(result => result[0]?.transcript ?? '').join(' ').trim();
      if (words) latest.current.onTranscript(words);
    };
    engine.onerror = event => {
      if (event.error !== 'aborted') latest.current.onMessage(latest.current.t(event.error === 'not-allowed' ? 'Microphone access was declined. You can still type your message.' : 'Voice input could not finish. Please try again or type your message.'));
    };
    engine.onend = () => { starting.current = false; setListening(false); recognition.current = null; };
    try {
      starting.current = true; engine.start(); setListening(true);
      onMessage(t('Listening. Your browser processes speech. Review the text before sending.'));
    } catch { starting.current = false; setListening(false); recognition.current = null; onMessage(t('Voice input could not start. Please try your keyboard microphone.')); }
  }
  return <button type="button" className={`icon-button voice-button ${listening ? 'listening' : ''}`} disabled={disabled} onClick={toggle} aria-pressed={listening} aria-label={t(listening ? 'Stop listening' : 'Speak your message')} title={t('Speech recognition uses your browser’s speech service.')}>
    {listening ? <Square size={19} fill="currentColor"/> : <Mic size={21}/>}
  </button>;
}
