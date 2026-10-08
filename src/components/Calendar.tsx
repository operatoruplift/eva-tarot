import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MessageCircle, NotebookPen, Wind } from 'lucide-react';
import type { Session } from '../lib/storage';
import { useLanguage } from '../lib/i18n';
import { CALENDAR_MIN_YEAR, CALENDAR_MAX_YEAR, dateKey, normalizeDayKey, getCalendarRecords, getCalendarDays, isCalendarDateSupported, shiftCalendarMonth } from '../lib/calendar';
import './calendar.css';
export { dateKey, normalizeDayKey } from '../lib/calendar';

export type CalendarProps = {
  sessions: Session[];
  practiceDays: string[];
  notes: Record<string, string>;
  saveStatus: string;
  onNoteChange: (date: string, note: string) => void;
  onOpenSession: (session: Session) => void;
  onRead?: () => void;
};

export function Calendar({ sessions, practiceDays, notes, saveStatus, onNoteChange, onOpenSession, onRead }: CalendarProps) {
  const { t, formatDate, locale } = useLanguage();
  const [selected, setSelected] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const today = dateKey(new Date());
  const selectedKey = dateKey(selected);
  const isFuture = selectedKey > today;
  const practices = useMemo(() => new Set(practiceDays.map(normalizeDayKey).filter(Boolean)), [practiceDays]);
  const records = useMemo(() => getCalendarRecords(sessions), [sessions]);
  const daySessions = records[selectedKey] || [];
  const days = getCalendarDays(month);
  const atFirstMonth = month.getFullYear() === CALENDAR_MIN_YEAR && month.getMonth() === 0;
  const atLastMonth = month.getFullYear() === CALENDAR_MAX_YEAR && month.getMonth() === 11;
  const weekdays = Array.from({ length: 7 }, (_, index) => formatDate(new Date(2024, 0, 1 + index), { weekday: 'short' }));

  function moveMonth(direction: -1 | 1) {
    setMonth(previous => shiftCalendarMonth(previous, direction));
  }
  function selectDate(date: Date) {
    if (!isCalendarDateSupported(date)) return;
    setSelected(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  return <div className="calendar-content screen-enter">
    <div className="page-intro"><span className="eyebrow">{t('A LITTLE SPACE FOR EVERY DAY')}</span><h1>{t('Your days, unfolding.')}</h1><p>{t('Look back at your moments. Make room for what comes next.')}</p></div>
    <section className="calendar-panel" aria-label={t('Your reflection calendar')}>
      <div className="calendar-toolbar">
        <h2 aria-live="polite">{formatDate(month, { month: 'long', year: 'numeric' })}</h2>
        <div><button className="text-button calendar-today" onClick={() => selectDate(new Date())}>{t('Today')}</button><button className="icon-button" disabled={atFirstMonth} onClick={() => moveMonth(-1)} aria-label={t('Previous month')}><ChevronLeft size={21}/></button><button className="icon-button" disabled={atLastMonth} onClick={() => moveMonth(1)} aria-label={t('Next month')}><ChevronRight size={21}/></button></div>
      </div>
      <label className="calendar-month-picker"><CalendarDays size={16}/><span>{t('Jump to month')}</span><input type="month" min={`${CALENDAR_MIN_YEAR}-01`} max={`${CALENDAR_MAX_YEAR}-12`} value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`} onChange={event => { const [year, monthNumber] = event.target.value.split('-').map(Number); if (Number.isInteger(year) && year >= CALENDAR_MIN_YEAR && year <= CALENDAR_MAX_YEAR && Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12) setMonth(new Date(year, monthNumber - 1, 1)); }}/></label>
      <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day, index) => <span key={index}>{day}</span>)}</div>
      <div className="calendar-grid" role="group" aria-label={formatDate(month, { month: 'long', year: 'numeric' })}>
        {days.map(day => {
          const key = dateKey(day);
          const hasRecords = !!records[key]?.length || practices.has(key);
          const hasNote = !!notes[key]?.trim();
          return <button key={key} disabled={!isCalendarDateSupported(day)} className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${key === selectedKey ? 'selected' : ''} ${key === today ? 'today' : ''}`} aria-pressed={key === selectedKey} aria-current={key === today ? 'date' : undefined} aria-label={`${formatDate(day, { dateStyle: 'full' })}${hasRecords ? ` · ${t('Has records')}` : ''}${hasNote ? ` · ${t('Has a note')}` : ''}`} onClick={() => selectDate(day)}><span>{new Intl.NumberFormat(locale).format(day.getDate())}</span><span className="calendar-dots" aria-hidden="true">{hasRecords && <i className="record-dot"/>}{hasNote && <i className="note-dot"/>}</span></button>;
        })}
      </div>
      <div className="calendar-legend"><span><i className="record-dot"/>{t('Reading or breath')}</span><span><i className="note-dot"/>{t('Note or intention')}</span></div>
    </section>
    <section className="calendar-day-detail" aria-label={t('Selected day')}>
      <div className="calendar-detail-heading"><div><span className="eyebrow">{selectedKey === today ? t('TODAY') : isFuture ? t('A DAY AHEAD') : t('A MOMENT IN YOUR STORY')}</span><h2>{formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric', year: selected.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}</h2></div><CalendarDays size={24}/></div>
      {isFuture && <p className="calendar-planned">{t('A plan, not a prediction. Leave an intention for this day.')}</p>}
      {daySessions.map(({ session, lastActivity }) => <button className="calendar-record" key={session.id} onClick={() => onOpenSession(session)}><span className="calendar-record-icon"><MessageCircle size={20}/></span><span><strong>{session.title}</strong><small>{formatDate(lastActivity, { hour: 'numeric', minute: '2-digit' })} · {t(session.saved ? 'Saved reading' : 'Conversation')}</small></span><ArrowRight size={18}/></button>)}
      {practices.has(selectedKey) && <div className="calendar-record breath-record"><span className="calendar-record-icon"><Wind size={20}/></span><span><strong>{t('A moment to breathe')}</strong><small>{t('Breathing practice completed')}</small></span></div>}
      {!daySessions.length && !practices.has(selectedKey) && !isFuture && <div className="calendar-empty"><p>{t('No moments recorded on this day yet.')}</p>{selectedKey === today && onRead && <button className="text-button" onClick={onRead}>{t('Start a conversation')}<ArrowRight size={16}/></button>}</div>}
      <label className="calendar-note-label" htmlFor="calendar-note"><NotebookPen size={18}/>{t(isFuture ? 'An intention for this day' : 'A note for this day')}<span role="status">{saveStatus}</span></label>
      <textarea id="calendar-note" maxLength={2000} value={notes[selectedKey] || ''} placeholder={t(isFuture ? 'What would you like to make space for?' : 'What would you like to remember?')} onChange={event => onNoteChange(selectedKey, event.target.value)}/>
    </section>
  </div>;
}
