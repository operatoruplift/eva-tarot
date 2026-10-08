import { useState } from 'react';
import { Pencil, ArrowRight } from 'lucide-react';
import { Modal } from './Modal';
import { SoftSelect } from './SoftSelect';
import { useLanguage } from '../lib/i18n';
import type { Session } from '../lib/storage';
import { readingCounts, spreadLabels } from '../data/spreads';

export function EditReading({session,messageId,onClose,onSave,onRevise}:{session:Session;messageId:string;onClose:()=>void;onSave:(title:string,note:string)=>void;onRevise:(question:string,title:string,keepCards:boolean,count:number,note:string)=>void}) {
  const {t}=useLanguage();
  const original=session.messages.find(message=>message.id===messageId)?.text||'';
  const [title,setTitle]=useState(session.title),[question,setQuestion]=useState(original),[note,setNote]=useState(session.note);
  const [keepCards,setKeepCards]=useState(true),[count,setCount]=useState(session.drawCount||3);
  const hasCards=session.messages.some(message=>message.cards?.length);
  const canRevise=session.messages.some(message=>message.role==='user'&&message.id===messageId);
  return <Modal title={t('Edit reading')} onClose={onClose}><div className="edit-reading"><span className="eyebrow">{t('YOUR READING, REVISITED')}</span><h2>{t('What would you like to change?')}</h2>
    <label htmlFor="edit-title">{t('Title')}</label><input id="edit-title" value={title} maxLength={1000} onChange={event=>setTitle(event.target.value)}/>
    <label htmlFor="edit-question">{t('Your question')}</label><textarea id="edit-question" rows={4} value={question} maxLength={1000} onChange={event=>setQuestion(event.target.value)}/>
    <label htmlFor="edit-note">{t('Your notes')}</label><textarea id="edit-note" rows={2} value={note} maxLength={1200} onChange={event=>setNote(event.target.value)}/>
    <button className="secondary-button" disabled={!title.trim()} onClick={()=>onSave(title.trim(),note)}><Pencil size={17}/>{t('Save title & notes')}</button>
    <div className="revise-options"><label className="checkbox-label"><input type="checkbox" checked={keepCards} onChange={event=>setKeepCards(event.target.checked)}/>{t(hasCards?'Keep the same cards':'Keep earlier conversation context')}</label>
    {!keepCards&&<div><label htmlFor="edit-reading-style">{t('New reading style')}</label><SoftSelect id="edit-reading-style" aria-label={t('New reading style')} value={count} onChange={setCount} options={readingCounts.map(value=>({value,label:t(spreadLabels[value])}))}/></div>}
    <p>{t('A revised question creates a new version. Your original reading stays in History.')}</p>
    <button className="primary-button" disabled={!question.trim()||!canRevise} onClick={()=>onRevise(question.trim(),title.trim(),keepCards,count,note)}>{t('Revise question & read again')}<ArrowRight size={17}/></button></div>
  </div></Modal>;
}
