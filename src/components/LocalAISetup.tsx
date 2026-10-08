import { useEffect, useState } from 'react';
import { Download, ShieldCheck, LoaderCircle, X, Check, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { useLanguage } from '../lib/i18n';
import { LOCAL_AI_MODELS, refreshLocalAIModelCache, removeLocalAIModel, setLocalAIModel, type LocalAIModelKey, type LocalAIState } from '../lib/local-ai';

export function LocalAISetup({state,preparing=false,startupError='',onEnable,onCancel,onClose,onReference}:{state:LocalAIState;preparing?:boolean;startupError?:string;onEnable:()=>void;onCancel:()=>void;onClose:()=>void;onReference?:()=>void}) {
  const {t}=useLanguage();
  const [actionError,setActionError]=useState('');
  const loading=!state.removing&&(state.status==='loading'||state.status==='checking');
  const busy=preparing||loading||state.removing||state.status==='generating';
  const selected=LOCAL_AI_MODELS.find(model=>model.key===state.model)??LOCAL_AI_MODELS[0];
  useEffect(()=>{void refreshLocalAIModelCache();},[state.model]);
  const choose=(key:LocalAIModelKey)=>{try{setLocalAIModel(key);setActionError('');}catch(error){setActionError(error instanceof Error?error.message:'Could not change the reader. Please try again.');}};
  const remove=async()=>{try{setActionError('');await removeLocalAIModel();}catch(error){setActionError(error instanceof Error?error.message:'Could not remove the reader. Please try again.');}};
  return <Modal title={t('Your private tarot reader')} onClose={onClose} className="ai-setup-modal"><div className="ai-setup">
    <span className="setup-symbol"><ShieldCheck size={30}/></span><span className="eyebrow">{t('ON YOUR DEVICE. IN YOUR OWN WORDS.')}</span>
    <h2>{t('A reader that listens.')}<br/>{t('A conversation that stays here.')}</h2>
    <p>{t('Eva uses the situation and feelings you share in chat to explore the cards with you. The cards are prompts for reflection, not predictions.')}</p>
    <fieldset className="model-choices" disabled={busy}><legend>{t('Choose your reader')}</legend>{LOCAL_AI_MODELS.map(model=><label key={model.key} className={`model-choice ${state.model===model.key?'selected':''}`}><input type="radio" name="local-reader" value={model.key} checked={state.model===model.key} onChange={()=>choose(model.key)}/><span className="model-choice-copy"><strong>{t(model.name)}{model.key==='light'&&<em>{t('Recommended')}</em>}</strong><span>{t(model.key==='detailed'?'About 1 GB · for deeper readings':'About 360 MB · simpler replies')}</span></span></label>)}</fieldset>
    <ul className="setup-facts"><li><Check size={17}/>{t('Your messages stay on this device.')}</li><li><Download size={17}/>{t(state.cached?'This reader is downloaded on this device.':'One-time download · about {size} MB',{size:selected.downloadMB})}</li><li><ShieldCheck size={17}/>{t('No subscription or AI API key needed.')}</li></ul>
    <p className="setup-small">{t('Requires a browser with WebGPU and enough memory. Local AI can make mistakes and may be less capable than ChatGPT.')}</p>
    {state.model==='detailed'&&<p className="setup-small">{t('The Detailed reader needs more memory and may be slower. Choose Light if your device struggles.')}</p>}
    {state.selectionWarning&&<p className="setup-error" role="status">{t(state.selectionWarning)}</p>}
    {preparing&&<p role="status"><LoaderCircle className="spin" size={18}/>{t('Saving your space before loading the reader…')}</p>}
    {startupError&&<p className="setup-error" role="alert">{startupError}</p>}
    {actionError&&<p className="setup-error" role="alert">{t(actionError)}</p>}
    {loading&&<div className="model-progress" role="status"><div><LoaderCircle className="spin" size={18}/>{t('Preparing your private reader…')}<strong>{Math.round(state.progress*100)}%</strong></div><progress value={state.progress} max={1}/><p>{t('Keep this page open. The first download can take a few minutes.')}</p><button className="text-button" onClick={onCancel}><X size={16}/>{t('Cancel download')}</button></div>}
    {state.removing&&<p role="status"><LoaderCircle className="spin" size={18}/>{t('Removing the downloaded reader…')}</p>}
    {(state.status==='error'||state.status==='unsupported')&&<p className="setup-error" role="alert">{t(state.detail)}</p>}
    {!busy&&state.status!=='unsupported'&&<button className="primary-button" onClick={onEnable}><Download size={18}/>{t(state.status==='ready'?'Continue conversation':state.cached?'Load reader & continue':'Download & start private AI')}</button>}
    {state.status==='generating'&&<div className="setup-error"><p>{t('Another reply is still being written. Wait for it to finish, or stop it before starting this question.')}</p><button className="text-button" onClick={onCancel}>{t('Stop current reply')}</button></div>}
    {state.status==='unsupported'&&<p>{t('Try a current browser with WebGPU support. Your history and card library still work here.')}</p>}
    {onReference&&!preparing&&<><p className="setup-small">{t('Card meanings are general reference notes; private AI connects them to your conversation.')}</p><button className="text-button reference-choice" onClick={onReference}>{t('Show card meanings only (not AI)')}</button></>}
    <button type="button" disabled={busy} className="text-button remove-reader" onClick={()=>void remove()}><Trash2 size={16}/>{t('Clear this reader’s download')}</button>
    <p className="setup-small">{t('Clears complete or partial downloads for the selected reader. Your conversations and other downloads stay saved.')}</p>
    <p className="setup-small">{t('Voice dictation may use your browser’s online speech service.')}</p>
    <p className="setup-small">{t('The model is downloaded from Hugging Face and MLC. Your chat text is not sent to them.')}</p>
  </div></Modal>;
}
