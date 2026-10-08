import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronRight, Compass, Download, Heart, HelpCircle, MessageCircle, Plus, RefreshCw, Settings2, Sparkles, Sun, Wind, X, CalendarDays, Search, Globe, Upload, LoaderCircle, Pencil, Square, ShieldCheck } from 'lucide-react';
import { Brand, Logo } from './components/Brand';
import { Modal } from './components/Modal';
import { SoftSelect } from './components/SoftSelect';
import { BreathingPractice } from './components/BreathingPractice';
import { CardBack, CardDeck, DrawnCards } from './components/TarotCards';
import { CardGuidance } from './components/CardGuidance';
import { TodayScreen, topics } from './components/Rituals';
import { CloudAccount } from './components/CloudAccount';
import { Calendar } from './components/Calendar';
import { ProfilePhoto, ProfileAvatar } from './components/ProfilePhoto';
import { VoiceInput } from './components/VoiceInput';
import { useCloudJournal } from './lib/cloud';
import { usePersistentData, createDataExport, parseDataImport, MAX_BACKUP_BYTES } from './lib/persistence';
import { useLanguage, languages } from './lib/i18n';
import { cards, drawCards } from './data/tarot';
import { tarotVi } from './data/tarot-vi';
import { readingCounts, spreadLabels } from './data/spreads';
import type { TarotCard } from './data/tarot';
import type { ReadingLanguage } from './data/spreads';
import { generateDemoReading, getReading } from './lib/readings';
import { getLocalAIState, subscribeLocalAI, enableLocalAI, generateLocalReading, cancelLocalAI, disposeLocalAI } from './lib/local-ai';
import { approveOnlineSession, needsOnlineApproval, readOnlineApproval, saveOnlineApproval, withReaderIntent, type ReaderMode } from './lib/reader-mode';
import { OnlineDisclosure, ReaderOptions } from './components/ReaderOptions';
import { MissingReading } from './components/MissingReading';
import { routeHash, readRoute, legacyPathHash, type AppView, type MissingReadingReason } from './lib/routes';
import { waitForReaderSave } from './lib/reader-save-gate';
import { DEFAULT_READING_STYLE, latestQuestion, hasReplyForCurrentSpread, hasReplyToLatestQuestion } from './lib/conversation-flow';
import { recommendSpread, conversationContext } from './lib/reading-context';
import { ReferenceContextAction } from './components/ReferenceContextAction';
import { reviseConversation } from './lib/revisions';
import { LocalAISetup } from './components/LocalAISetup';
import { EditReading } from './components/EditReading';
import { DomainTransfer } from './components/DomainTransfer';
import { localDay } from './lib/storage';
import type { Session } from './lib/storage';

type View = AppView | 'missing';
type Phase = 'idle' | 'shuffling' | 'picking';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const uid = () => crypto.randomUUID();
const navItems = [
  {view:'home' as const,label:'Chat',icon:MessageCircle},
  {view:'calendar' as const,label:'Calendar',icon:CalendarDays},
  {view:'journal' as const,label:'History',icon:Bookmark},
  {view:'breathe' as const,label:'Breathe',icon:Wind},
];
function routeTo(view: AppView, id?:string) {
  const hash = routeHash(view,id);
  if (window.location.hash !== hash) window.history.pushState({evara:true},'',hash);
}
function Paragraphs({text}:{text:string}) {
  const inline=(value:string)=>value.split(/(\*\*[^*]+\*\*)/g).map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:part);
  return <div className="reading-prose">{text.split(/\n\s*\n/).filter(Boolean).map((paragraph,index)=>{
    const lines=paragraph.trim().split('\n');
    if(lines.every(line=>/^\s*[-*]\s+/.test(line)))return <ul key={index}>{lines.map((line,item)=><li key={item}>{inline(line.replace(/^\s*[-*]\s+/,''))}</li>)}</ul>;
    if(lines.length===1&&/^#{1,6}\s/.test(paragraph))return <h3 key={index}>{inline(paragraph.replace(/^#{1,6}\s+/,''))}</h3>;
    return <p key={index}>{inline(paragraph.replace(/^#{1,6}\s+/gm,''))}</p>;
  })}</div>;
}

export default function App() {
  const data = usePersistentData();
  const {profile,setProfile,sessions,setSessions,practiceDays,setPracticeDays,dayNotes,setDayNotes,ready} = data;
  const {t,language,setLanguage,locale,formatDate} = useLanguage();
  const [view,setView] = useState<View>('home');
  const [missingReason,setMissingReason] = useState<MissingReadingReason>('missing');
  const [activeId,setActiveId] = useState<string|null>(null);
  const [input,setInput] = useState('');
  const [spread,setSpread] = useState(DEFAULT_READING_STYLE);
  const [phase,setPhase] = useState<Phase>('idle');
  const [deck,setDeck] = useState<TarotCard[]>([]);
  const [selected,setSelected] = useState<number[]>([]);
  const [loadingIds,setLoadingIds] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const replyControllers = useRef(new Map<string,AbortController>());
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [modal,setModal] = useState<'about'|'settings'|'install'|'language'|null>(null);
  const [detail,setDetail] = useState<TarotCard|null>(null);
  const [nameDraft,setNameDraft] = useState('');
  const [toast,setToast] = useState('');
  const [ai,setAI] = useState(getLocalAIState);
  const [readerMode,setReaderMode] = useState<ReaderMode>('online');
  const [showReaderOptions,setShowReaderOptions] = useState(false);
  const [showOnlineDisclosure,setShowOnlineDisclosure] = useState(false);
  const [initialOnlineApproval] = useState(() => { try { return readOnlineApproval(window.localStorage); } catch { return readOnlineApproval(); } });
  const onlineApproval = useRef(initialOnlineApproval);
  const [showAI,setShowAI] = useState(false);
  const [preparingAI,setPreparingAI] = useState(false);
  const [aiStartupError,setAIStartupError] = useState('');
  const enablingAI = useRef(false);
  const aiSetupAttempt = useRef(0);
  const [streaming,setStreaming] = useState<Record<string,string>>({});
  const [editing,setEditing] = useState<{session:Session;messageId:string}|null>(null);
  const [deckSuit,setDeckSuit] = useState('all');
  const [deckSearch,setDeckSearch] = useState('');
  const pendingAI = useRef<{session:Session;drawn:TarotCard[];question:string}|null>(null);
  const [installPrompt,setInstallPrompt] = useState<InstallPrompt|null>(null);
  const installing = useRef(false);
  const [online,setOnline] = useState(navigator.onLine);
  const [search,setSearch] = useState('');
  const [savedOnly,setSavedOnly] = useState(false);
  const [voiceMessage,setVoiceMessage] = useState('');
  const [voiceContext,setVoiceContext] = useState(0);
  const [importing,setImporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const current = sessions.find(session=>session.id === activeId);
  const activeDraw = (current ? [...current.messages].reverse().find(message=>message.cards?.length)?.cards : undefined) || [];
  const generating = view === 'chat' && !!current && loadingIds.has(current.id);
  const busy = generating || phase === 'shuffling';
  const error = current && Object.hasOwn(errors,current.id) ? errors[current.id] : undefined;
  const streamed = current && Object.hasOwn(streaming,current.id) ? streaming[current.id] : '';
  const dailySession = sessions.find(session=>session.daily && new Date(session.date).toDateString() === new Date().toDateString() && session.messages.some(message=>message.cards?.length));
  const completedDays = [...practiceDays,...sessions.filter(session=>session.messages.some(message=>message.mode)).map(session=>{const d=new Date(session.date);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;})];
  const cloud = useCloudJournal({
    profile,sessions,practiceDays,dayNotes,language,ready:ready&&!data.needsRecovery,
    onRestore: restored=>{setProfile(restored.profile);setSessions(restored.sessions);setPracticeDays(restored.practiceDays || []);setDayNotes(restored.dayNotes || {});if(restored.language)setLanguage(restored.language as typeof language);},
  });

  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{
    const unsubscribe=subscribeLocalAI(()=>setAI(getLocalAIState()));
    const install=(event:Event)=>{event.preventDefault();setInstallPrompt(event as InstallPrompt);};
    const connected=()=>setOnline(navigator.onLine);
    window.addEventListener('beforeinstallprompt',install);window.addEventListener('online',connected);window.addEventListener('offline',connected);
    return()=>{unsubscribe();window.removeEventListener('beforeinstallprompt',install);window.removeEventListener('online',connected);window.removeEventListener('offline',connected);if(startTimer.current)clearTimeout(startTimer.current);};
  },[]);
  useEffect(()=>{
    const scroller=scrollRef.current;if(!scroller)return;
    if(view!=='chat'){scroller.scrollTo({top:0});return;}
    const messages=Array.from(scroller.querySelectorAll<HTMLElement>('.message'));
    const target=messages.at(-1);
    const top=phase==='picking'||phase==='shuffling'||!target?scroller.scrollHeight:scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-18;
    scroller.scrollTo({top,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },[current?.messages.length,phase,view]);

  function clearSelection(){setVoiceContext(value=>value+1);if(startTimer.current)clearTimeout(startTimer.current);setPhase('idle');setSelected([]);setVoiceMessage('');}
  function go(next:AppView,record=true){if(next==='home')setActiveId(null);if(next===view)return;clearSelection();setView(next);setInput('');if(record)routeTo(next);}
  function newChat(){clearSelection();setActiveId(null);setInput('');setSpread(DEFAULT_READING_STYLE);setView('home');routeTo('home');}
  function openSettings(){setNameDraft(profile.name);setModal('settings');}
  function updateSession(id:string,update:(session:Session)=>Session){setSessions(previous=>previous.map(session=>session.id===id?update(session):session));}
  function openSession(session:Session,record=true){
    clearSelection();setActiveId(session.id);setView('chat');setInput('');if(record)routeTo('chat',session.id);
    const drawn=[...session.messages].reverse().find(message=>message.cards?.length)?.cards || [];
    if(!drawn.length && (session.drawCount ?? 3)>0){setDeck(drawCards(78));setPhase('picking');}
    else if((session.messages.at(-1)?.role==='user'||session.messages.at(-1)?.cards?.length)&&!inFlight.current.has(session.id)){
      setErrors(previous=>({...previous,[session.id]:t('Your conversation was paused. Continue whenever you’re ready.')}));
    }
  }
  async function generate(session:Session,drawn:TarotCard[],question:string,mode:ReaderMode=readerMode){
    if(inFlight.current.has(session.id))return;
    if(mode==='local'){
      session=withReaderIntent(session,'local');
      updateSession(session.id,entry=>withReaderIntent(entry,'local'));
    }
    if(mode==='online'&&needsOnlineApproval(onlineApproval.current,session)){
      pendingAI.current={session,drawn,question};setShowOnlineDisclosure(true);
      setErrors(previous=>({...previous,[session.id]:t('Your question is kept here. Continue with Online AI when you’re ready.')}));return;
    }
    if(mode==='local'&&getLocalAIState().status!=='ready'){
      pendingAI.current={session,drawn,question};setShowAI(true);
      setErrors(previous=>({...previous,[session.id]:t('Your question is in this chat. Start private AI to continue this conversation.')}));return;
    }
    const controller=new AbortController();replyControllers.current.set(session.id,controller);
    inFlight.current.add(session.id);setLoadingIds(new Set(inFlight.current));setErrors(previous=>{const next={...previous};delete next[session.id];return next;});
    setStreaming(previous=>({...previous,[session.id]:''}));
    try{
      await waitForReaderSave(data.flush,controller.signal);
      const request={signal:controller.signal,question,focus:session.focus,cards:drawn,language:language as ReadingLanguage,followUp:hasReplyForCurrentSpread(session.messages),history:conversationContext(session.messages)};
      const text=mode==='online'?(await getReading(request)).text:await generateLocalReading({...request,onToken:text=>setStreaming(previous=>({...previous,[session.id]:text}))});
      if(controller.signal.aborted)throw new DOMException('Reply stopped.','AbortError');
      if(text.trim()){
        updateSession(session.id,entry=>({...entry,messages:[...entry.messages,{id:uid(),createdAt:new Date().toISOString(),role:'assistant',text,mode:mode==='online'?'ai':'local'}]}));
        // Persistence owns save failures and retries; do not regenerate this answer.
      }
    }catch(cause){setErrors(previous=>({...previous,[session.id]:cause instanceof DOMException&&cause.name==='AbortError'?t('Reply stopped. Your question is still in this chat.'):cause instanceof Error?t(cause.message):t('Your reading could not be completed. Please try again.')}));}
    finally{replyControllers.current.delete(session.id);inFlight.current.delete(session.id);setLoadingIds(new Set(inFlight.current));setStreaming(previous=>{const next={...previous};delete next[session.id];return next;});}
  }
  function confirmOnline(){
    const pending=pendingAI.current;if(!pending){setShowOnlineDisclosure(false);return;}
    onlineApproval.current=approveOnlineSession(onlineApproval.current,pending.session.id);
    let saved=false;try{saved=saveOnlineApproval(onlineApproval.current,window.localStorage);}catch{/* This visit still has explicit approval. */}
    if(!saved)setToast(t('Your choice applies to this visit. This browser could not remember it.'));
    pendingAI.current=null;setShowOnlineDisclosure(false);
    const session=withReaderIntent(pending.session,'online');
    updateSession(session.id,entry=>withReaderIntent(entry,'online'));
    void generate(session,pending.drawn,pending.question,'online');
  }
  function closeOnlineDisclosure(){setShowOnlineDisclosure(false);pendingAI.current=null;}
  function chooseReader(mode:ReaderMode){
    if(inFlight.current.size)return;
    setReaderMode(mode);setShowReaderOptions(false);
    if(mode==='online'){
      cancelReaderSetup();disposeLocalAI();setShowAI(false);
      const pending=pendingAI.current;pendingAI.current=null;
      if(pending)void generate(pending.session,pending.drawn,pending.question,'online');
    }else{
      if(current)updateSession(current.id,entry=>withReaderIntent(entry,'local'));
      setShowAI(true);
    }
  }
  async function enableAI(){
    if(enablingAI.current||getLocalAIState().status==='generating')return;
    const attempt=++aiSetupAttempt.current;
    enablingAI.current=true;setPreparingAI(true);setAIStartupError('');
    try{
      // Commit the journal before a large download or GPU allocation can interrupt the page.
      const pending=pendingAI.current;
      if(pending){pending.session=withReaderIntent(pending.session,'local');updateSession(pending.session.id,entry=>withReaderIntent(entry,'local'));}
      await data.flush();
      if(attempt!==aiSetupAttempt.current)return;
      setPreparingAI(false);
      await enableLocalAI();
      if(attempt!==aiSetupAttempt.current)return;
      setShowAI(false);
      const resumed=pendingAI.current;pendingAI.current=null;
      if(resumed)void generate(resumed.session,resumed.drawn,resumed.question,'local');
    }catch(cause){if(attempt===aiSetupAttempt.current)setAIStartupError(cause instanceof Error?t(cause.message):t('The reader could not start. Please try again.'));}
    finally{if(attempt===aiSetupAttempt.current){enablingAI.current=false;setPreparingAI(false);}}
  }
  function cancelReaderSetup(){aiSetupAttempt.current++;enablingAI.current=false;setPreparingAI(false);cancelLocalAI();}
  function closeReaderSetup(){if(enablingAI.current)cancelReaderSetup();setShowAI(false);}
  function exploreFromSetup(){closeReaderSetup();pendingAI.current=null;go('learn');}
  function showReference(){
    const pending=pendingAI.current;if(!pending?.drawn.length)return;
    if(enablingAI.current)cancelReaderSetup();
    const text=generateDemoReading({question:pending.question,focus:pending.session.focus,cards:pending.drawn,history:conversationContext(pending.session.messages),language:language as ReadingLanguage});
    updateSession(pending.session.id,session=>({...session,messages:[...session.messages,{id:uid(),createdAt:new Date().toISOString(),role:'assistant',text,mode:'demo'}]}));
    setErrors(previous=>{const next={...previous};delete next[pending.session.id];return next;});pendingAI.current=null;setShowAI(false);
  }
  function revise(question:string,title:string,keepCards:boolean,count:number,note:string){
    if(!editing)return;
    const source=sessions.find(session=>session.id===editing.session.id)||editing.session;
    const revision=reviseConversation(source,editing.messageId,question,title,{id:uid(),now:new Date().toISOString(),keepCards,count});
    if(readerMode==='local'||needsOnlineApproval(onlineApproval.current,source))revision.privateReader=true;
    revision.note=note;setSessions(previous=>[revision,...previous]);setEditing(null);openSession(revision);
    if(keepCards||count===0)void generate(revision,[...revision.messages].reverse().find(message=>message.cards?.length)?.cards||[],question);
    setToast(t('New version created. Your original reading is kept in History.'));
  }
  function startConversation(question:string,count:number,daily=false){
    if(!ready)return;
    clearSelection();setInput('');
    const normalized=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const listing=/(?:78|toan bo|full|entire).*(?:deck|bai)|(?:list|show|liet ke|sap xep).*(?:cards|deck|bai)/.test(normalized);
    const recommendation=recommendSpread(question,[]);
    const automatic=count===-1;count=listing?0:automatic?recommendation.count:count;
    const session:Session={id:uid(),title:daily?t('My daily reflection'):question,focus:daily?'Daily reflection':count===0?'Conversation':'A little direction',date:new Date().toISOString(),messages:[{id:uid(),createdAt:new Date().toISOString(),role:'user',text:question}],saved:false,note:'',daily,drawCount:count,privateReader:readerMode==='local'};
    if(count>0)session.messages.push({id:uid(),createdAt:new Date().toISOString(),role:'assistant',text:automatic?`${t('Suggested spread: {count} cards.',{count})} ${t(recommendation.reason)}\n\n${t('Draw when you’re ready, or choose a different spread below.')}`:t('A {count}-card reading. Draw when you’re ready.',{count})});
    setSessions(previous=>[session,...previous]);setActiveId(session.id);setView('chat');routeTo('chat',session.id);
    if(listing){const text=`${t('Here is your complete 78-card deck, in order.')}\n\n${cards.map(card=>`${card.id+1}. ${language==='vi'?tarotVi[card.id].name+' · '+card.name:card.name}`).join('\n')}\n\n${t('Fool to World, then Wands, Cups, Swords and Pentacles. Each suit runs Ace to King. The app uses Rider–Waite–Smith artwork, not the Gilded Tarot illustrations.')}`;updateSession(session.id,entry=>({...entry,messages:[...entry.messages,{id:uid(),createdAt:new Date().toISOString(),role:'assistant',text}]}));return;}
    if(count===0){void generate(session,[],question);return;}
    setDeck(drawCards(78));setPhase('shuffling');
    startTimer.current=setTimeout(()=>setPhase('picking'),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:500);
  }
  function daily(){if(dailySession)openSession(dailySession);else startConversation(t('What can I bring into my day with a little more intention?'),1,true);}
  function addCards(){
    if(!current||busy||inFlight.current.size||phase!=='idle')return;
    clearSelection();
    const question=input.trim()||latestQuestion(current);
    const count=recommendSpread(question,conversationContext(current.messages)).count;
    const updated:Session={...current,drawCount:count,messages:input.trim()?[...current.messages,{id:uid(),createdAt:new Date().toISOString(),role:'user',text:question}]:current.messages};
    updateSession(current.id,()=>updated);setInput('');setDeck(drawCards(78));setPhase('picking');
    setErrors(previous=>{const next={...previous};delete next[current.id];return next;});
  }
  function cancelDraw(){
    if(!current)return;
    const updated={...current,drawCount:activeDraw.length};
    updateSession(current.id,()=>updated);clearSelection();
    if(!hasReplyToLatestQuestion(updated.messages))void generate(updated,activeDraw,latestQuestion(updated));
  }
  function reveal(indices=selected){
    if(!current||inFlight.current.has(current.id)||indices.length!==(current.drawCount||3))return;
    const chosen=indices.map(index=>deck[index]);
    const updated={...current,messages:[...current.messages,{id:uid(),createdAt:new Date().toISOString(),role:'assistant' as const,text:t('Your cards, a little space for possibility.'),cards:chosen}]};
    updateSession(current.id,()=>updated);setPhase('idle');void generate(updated,chosen,latestQuestion(current));
  }
  function submit(event:React.FormEvent){
    event.preventDefault();const question=input.trim();if(!question||busy||phase==='picking'||!ready)return;setInput('');setVoiceMessage('');
    if(view==='chat'&&current){const updated={...current,messages:[...current.messages,{id:uid(),createdAt:new Date().toISOString(),role:'user' as const,text:question}]};updateSession(current.id,()=>updated);void generate(updated,activeDraw,question);}
    else startConversation(question,spread);
  }
  function saveReading(){if(!current)return;updateSession(current.id,session=>({...session,saved:!session.saved}));setToast(t(current.saved?'Bookmark removed':'Conversation bookmarked'));}
  function chooseTopic(topic:typeof topics[number]){newChat();setInput(t(topic.prompt));textareaRef.current?.focus();}
  async function install(){
    if(installing.current)return;if(!installPrompt){setModal('install');return;}
    const prompt=installPrompt;installing.current=true;setInstallPrompt(null);
    try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')setToast(t('Eva Tarot is ready for your home screen.'));}catch{setModal('install');}finally{installing.current=false;}
  }
  function exportData(){
    const blob=new Blob([createDataExport({profile,sessions,practiceDays,dayNotes},language)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`eva-tarot-backup-${localDay()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setToast(t('Your data has been exported.'));
  }
  async function importData(file?:File){
    if(!file||importing)return;
    setImporting(true);let restored=false;
    try{if(file.size>MAX_BACKUP_BYTES)throw new Error('This backup is too large.');const imported=parseDataImport(await file.text());await data.restoreData(imported);restored=true;await data.flush();if(imported.language)setLanguage(imported.language as typeof language);setToast(t('Backup imported. Your existing conversations are kept.'));}
    catch(cause){setToast(restored?t('Your backup is open, but saving needs attention. Keep this tab open and export a copy.'):cause instanceof Error?t(cause.message):t('This backup could not be imported. Your current data is unchanged.'));}
    finally{setImporting(false);if(importRef.current)importRef.current.value='';}
  }
  const routeReader=useRef(()=>{});
  routeReader.current=()=>{
    const route=readRoute(window.location.hash,sessions);
    if(route.view==='chat'){const session=sessions.find(entry=>entry.id===route.sessionId);if(session)openSession(session,false);return;}
    if(route.view==='missing'){clearSelection();setActiveId(null);setMissingReason(route.reason);setView('missing');return;}
    go(route.view,false);
  };
  useEffect(()=>{
    if(!ready||data.needsRecovery)return;
    if(!window.location.hash){const legacy=legacyPathHash(window.location.pathname);window.history.replaceState({evara:true},'',`${legacy?'/':window.location.pathname}${window.location.search}${legacy||'#chat'}`);}
    routeReader.current();
    const back=()=>routeReader.current();window.addEventListener('popstate',back);window.addEventListener('hashchange',back);
    return()=>{window.removeEventListener('popstate',back);window.removeEventListener('hashchange',back);};
  },[ready,data.needsRecovery]);

  const shownSessions=sessions.filter(session=>(!savedOnly||session.saved)&&`${session.title} ${session.note} ${session.messages.map(m=>m.text).join(' ')}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  const pageTitle=t(view==='calendar'?'Calendar':view==='journal'?'All conversations':view==='breathe'?'A softer moment':view==='learn'?'Meet the cards':view==='rituals'?'Daily rituals':view==='chat'?'Your conversation':'Eva Tarot');
  const translatedDetail=detail&&language==='vi'?{...detail,...tarotVi[detail.id]}:detail;
  const showComposer=view==='home'||(view==='chat'&&phase==='idle');
  const saveLabel=t(data.status==='error'?'Saving needs attention':data.isCurrentDataSaved?'Saved on this device':'Saving…');
  if(!ready)return <main className="loading-app" role="status"><Logo size={64}/><p>{t('Opening your saved space…')}</p></main>;

  if(data.needsRecovery)return <main className="loading-app recovery-app"><Logo size={64}/><h1>{t('Your saved space needs a moment.')}</h1><p role="alert">{t('Your journal could not be opened. Eva has paused here instead of starting with an empty history.')}</p><p>{t('Eva has not replaced your saved history. Close other Eva tabs, then try again.')}</p><button className="primary-button" disabled={data.status==='loading'} onClick={()=>data.retrySave()}>{data.status==='loading'?<LoaderCircle className="spin" size={18}/>:<RefreshCw size={18}/>} {t('Try opening my saved space again')}</button>{(sessions.length>0||profile.name||profile.avatar||practiceDays.length>0||Object.keys(dayNotes).length>0)&&<button className="secondary-button" onClick={exportData}>{t('Export available data')}</button>}</main>;

  return <div className={`app-shell view-${view}`}>
    <aside className="sidebar" aria-label={t('Main navigation')}>
      <button className="brand-button" onClick={newChat} aria-label={t('Eva Tarot home')}><Brand/></button>
      <p className="sidebar-tagline">{t('A little clarity, within.')}</p>
      <button className="new-reading" onClick={newChat}><Plus size={19}/>{t('New conversation')}<Sparkles size={17}/></button>
      <nav className="primary-nav">{navItems.map(item=><button key={item.view} className={view===item.view||(item.view==='home'&&view==='chat')?'active':''} onClick={()=>go(item.view)}><item.icon size={21}/><span>{t(item.label)}</span></button>)}<button onClick={()=>go('rituals')}><Sun size={21}/>{t('Daily rituals')}</button></nav>
      <div className="recent-section"><span className="eyebrow">{t('RECENT CONVERSATIONS')}</span>{sessions.slice(0,12).map(session=><button key={session.id} className={`recent-item ${session.id===activeId&&view==='chat'?'selected':''}`} onClick={()=>openSession(session)}><MessageCircle size={16}/><span>{session.title}</span>{loadingIds.has(session.id)&&<LoaderCircle className="spin" size={14}/>}</button>)}</div>
      <div className="sidebar-bottom"><button className="install-button" onClick={()=>void install()}><Download size={18}/>{t('Add to home screen')}<ChevronRight size={17}/></button><button className="profile-button" onClick={openSettings}><ProfileAvatar profile={profile} size={42}/><span>{profile.name||t('Your personal space')}<small>{t('Profile & settings')}</small></span><Settings2 size={18}/></button></div>
    </aside>
    <main className="main-shell">
      <header className="topbar conversation-topbar">
        <div className="topbar-left">
          {view==='home'?<button className="home-brand-button" onClick={newChat} aria-label={t('Eva Tarot home')}><Brand compact/></button>:view==='chat'||view==='learn'||view==='rituals'?<button className="icon-button" onClick={newChat} aria-label={t('Back to chat')}><ArrowLeft size={22}/></button>:<button className="header-avatar" onClick={openSettings} aria-label={t('Your profile and settings')}><ProfileAvatar profile={profile} size={42}/></button>}
          <div className={`header-greeting ${view==='home'?'home-greeting':''}`}><strong>{view==='home'?(profile.name?t('Hi, {name}',{name:profile.name}):t('Your daily space')):pageTitle}</strong><span>{!online&&`${t('Offline reflection')} · `}{saveLabel}</span></div>
        </div>
        <div className="topbar-right"><button className="icon-button" onClick={()=>setModal('language')} aria-label={t('Language')} title={t('Language')}><Globe size={20}/></button><button className="icon-button" onClick={()=>setModal('about')} aria-label={t('How Eva Tarot works')}><HelpCircle size={20}/></button>{view==='home'&&<button className="header-avatar home-profile" onClick={openSettings} aria-label={t('Your profile and settings')}><ProfileAvatar profile={profile} size={38}/></button>}</div>
      </header>
      <DomainTransfer saved={data.isCurrentDataSaved} data={{profile,sessions,practiceDays,dayNotes}} language={language} onImport={async imported=>{await data.restoreData(imported);await data.flush();if(imported.language)setLanguage(imported.language as typeof language);newChat();}}/>
      {data.limitedStorage&&<p className="limited-storage-note">{t('This browser has limited storage. Export a backup regularly to keep your data safe.')}</p>}
      {data.status==='error'&&<div className="save-warning" role="alert"><span>{t('Your latest changes could not be saved. Export a copy to keep them safe.')}</span><button onClick={()=>void data.retrySave()}>{t('Try again')}</button><button onClick={exportData}>{t('Export')}</button></div>}
      <div className={`scroll-area ${view==='chat'?'chat-scroll':''}`} ref={scrollRef}>
        {view==='missing'&&<MissingReading reason={missingReason} onHistory={()=>go('journal')} onNewConversation={newChat}/>}
        {view==='home'&&<section className="chat-home screen-enter">
          <div className="home-chat-symbol" role="img" aria-label={t('Eva Tarot lotus logo')}><i className="lotus-orbit"/><Logo size={104}/><span className="lotus-glint" aria-hidden="true">✧</span></div>
          <span className="eyebrow">{t('A LITTLE CLARITY, JUST FOR YOU')}</span>
          <h1>{t('What’s on your mind?')}</h1>
          <p>{t('Talk about what’s on your mind. Add cards whenever you want a little perspective.')}</p>
          <div className="home-how-it-works" aria-label={t('How to begin')}><span><MessageCircle size={14}/>{t('Share your situation')}</span><span><Sparkles size={14}/>{t('Add cards if you like')}</span></div>
          <div className="question-examples">{[
            ['Love & relationships','Help me understand what I need in a relationship.','Love & connection'],
            ['Work & decisions','I’m torn between staying in my job and trying something new.','Find my direction'],
            ['Just talk','I feel stuck lately. Can we talk through what’s going on?','A moment for me']
          ].map(([label,prompt,caption],index)=><button className={`question-example example-${index}`} key={label} onClick={()=>{setInput(t(prompt));setSpread(label==='Just talk'?0:-1);textareaRef.current?.focus();}}><span className="example-icon" aria-hidden="true">{index===0?<Heart size={20}/>:index===1?<Compass size={20}/>:<MessageCircle size={20}/>}</span><span className="example-copy"><span>{t(label)}</span><strong>{t(caption)}</strong></span><ArrowRight size={17}/></button>)}</div>
          <div className="home-quick-actions"><button onClick={daily}><span className="quick-action-icon"><Sun size={20}/></span><span>{t(dailySession?'Revisit my card':'Daily card')}<small>{t('A little ritual for today')}</small></span><ArrowRight size={16}/></button><button onClick={()=>go('learn')}><span className="quick-action-icon"><Compass size={20}/></span><span>{t('Explore 78 cards')}<small>{t('Get to know your deck')}</small></span><ArrowRight size={16}/></button></div>
          <button className="private-ai-status ready" onClick={()=>{pendingAI.current=null;setShowReaderOptions(true);}}><MessageCircle size={15}/>{t(readerMode==='online'?'Online AI · no download needed':'On-device AI · experimental')}<ChevronRight size={15}/></button>
        </section>}
        {view==='rituals'&&<TodayScreen hasDaily={!!dailySession} days={completedDays} onDaily={daily} onRead={newChat} onBreathe={()=>go('breathe')} onExplore={()=>go('learn')} onTopic={chooseTopic}/>}
        {view==='calendar'&&<Calendar sessions={sessions} practiceDays={practiceDays} notes={dayNotes} saveStatus={saveLabel} onNoteChange={(key,note)=>setDayNotes(previous=>({...previous,[key]:note}))} onOpenSession={session=>openSession(session)} onRead={newChat}/>}
        {view==='breathe'&&<BreathingPractice onHome={newChat} onComplete={()=>{setPracticeDays(previous=>[...new Set([...previous,localDay()])]);setToast(t('One gentle moment, made for you.'));}}/>}
        {view==='chat'&&current&&<div className="chat-content screen-enter"><div className="reading-heading"><button className="icon-button" disabled={generating} aria-label={t('Edit reading')} onClick={()=>setEditing({session:current,messageId:current.messages.find(message=>message.role==='user')?.id||''})}><Pencil size={18}/></button><span>{t(current.drawCount===10?'10-card Celtic Cross':current.drawCount===0?'Conversation':current.focus)}</span><small>{formatDate(new Date(current.date),{month:'short',day:'numeric'})}</small><button className={`icon-button ${current.saved?'saved':''}`} onClick={saveReading} aria-label={t(current.saved?'Remove from saved conversations':'Save conversation')}><Bookmark size={20} fill={current.saved?'currentColor':'none'}/></button></div>{current.revisedFrom&&<p className="revision-notice">{t('Revised reading')} · <button onClick={()=>{const original=sessions.find(session=>session.id===current.revisedFrom);if(original)openSession(original);}}>{t('View original')}</button></p>}{current.messages.map(message=><article className={`message message-${message.role}`} key={message.id}>{message.role==='assistant'&&<span className="assistant-avatar"><Logo size={29}/></span>}<div className="message-body">{message.role==='assistant'&&<div className="message-author">Eva Tarot{message.mode&&<span>{t(message.mode==='local'?'On-device AI':message.mode==='demo'?'Card reference · not AI':'AI reflection')}</span>}</div>}<Paragraphs text={message.text}/>{message.mode==='demo'&&<ReferenceContextAction disabled={generating||phase!=='idle'} onPersonalize={()=>void generate(current,activeDraw,[...current.messages].reverse().find(entry=>entry.role==='user')?.text||current.title)}/>} {message.role==='user'&&<button className="edit-question-button" disabled={generating} onClick={()=>setEditing({session:current,messageId:message.id})}><Pencil size={13}/>{t('Edit question')}</button>}{message.cards&&<DrawnCards cards={message.cards} onDetail={setDetail}/>}</div></article>)}
          {phase==='shuffling'&&<div className="shuffle-state" role="status"><div className="mini-shuffle"><CardBack/><CardBack/><CardBack/></div><span>{t('A little possibility is unfolding…')}</span></div>}
          {phase==='picking'&&<><CardDeck key={current.id} onShuffle={()=>{setDeck(drawCards(78));setSelected([]);}} onCountChange={count=>{setSelected([]);updateSession(current.id,session=>({...session,drawCount:count}));}} count={current.drawCount||3} deck={deck} selected={selected} onSelect={index=>setSelected(previous=>previous.includes(index)?previous.filter(value=>value!==index):previous.length<(current.drawCount||3)?[...previous,index]:previous)} onReveal={()=>reveal()} onAuto={()=>reveal(Array.from({length:current.drawCount||3},(_,i)=>i))}/><button className="text-button cancel-draw" onClick={cancelDraw}>{t('Keep chatting without a new draw')}</button></>}
          {generating&&streamed&&<article className="message message-assistant streaming-response"><span className="assistant-avatar"><Logo size={29}/></span><div className="message-body"><div className="message-author">Eva Tarot<span>{t('On-device AI')}</span></div><Paragraphs text={streamed}/></div></article>}
          {generating&&<div className="typing-indicator" role="status"><Logo size={28}/><span>{t(activeDraw.length?'Reflecting on your cards…':'Eva Tarot is thinking…')}</span><span className="typing-dots"><i/><i/><i/></span><button className="stop-reading" onClick={()=>replyControllers.current.get(current.id)?.abort()}><Square size={13}/>{t('Stop')}</button></div>}
          {error&&<div className="error-panel" role="alert"><p>{error}</p><button className="text-button" disabled={generating||phase!=='idle'} onClick={()=>void generate(current,activeDraw,latestQuestion(current))}><RefreshCw size={16}/>{t('Try again')}</button>{readerMode==='local'&&<button className="text-button" disabled={generating||phase!=='idle'} onClick={()=>{pendingAI.current={session:current,drawn:activeDraw,question:latestQuestion(current)};chooseReader('online');}}>{t('Use Online AI')}</button>}</div>}
          {!generating&&!error&&data.isCurrentDataSaved&&current.messages.some(message=>message.mode)&&<div className="conversation-saved"><Check size={14}/>{t('Conversation saved automatically')}</div>}
        </div>}
        {view==='journal'&&<div className="library-content history-content screen-enter"><div className="page-intro"><span className="eyebrow">{t('YOUR STORY, KEPT HERE')}</span><h1>{t('All your conversations.')}</h1><p>{t('Every conversation is saved. Come back whenever you like.')}</p></div><div className="history-tools"><label className="history-search"><Search size={18}/><input aria-label={t('Search conversations')} placeholder={t('Search conversations')} value={search} onChange={event=>setSearch(event.target.value)}/></label><button className={savedOnly?'selected':''} aria-pressed={savedOnly} onClick={()=>setSavedOnly(value=>!value)}><Bookmark size={17}/>{t('Bookmarks')}</button></div><div className="journal-list">{shownSessions.map(session=><article className="journal-entry" key={session.id}><div className="journal-text"><span className="eyebrow">{formatDate(new Date(session.date),{year:'numeric',month:'short',day:'numeric'})} · {t(session.drawCount===10?'In-depth reading':session.drawCount===0?'Chat':'Tarot')}</span><h2>{session.title}</h2><button className="text-button history-edit" onClick={()=>setEditing({session,messageId:session.messages.find(message=>message.role==='user')?.id||''})}><Pencil size={16}/>{t('Edit reading')}</button><button className="text-button" onClick={()=>openSession(session)}>{t('Continue conversation')}<ArrowRight size={16}/></button><label className="note-label" htmlFor={`note-${session.id}`}>{t('A note to your future self')}</label><textarea id={`note-${session.id}`} value={session.note} maxLength={1200} placeholder={t('What stayed with you?')} onChange={event=>updateSession(session.id,value=>({...value,note:event.target.value}))}/></div><button className={`icon-button ${session.saved?'saved':''}`} aria-label={t(session.saved?'Remove from saved conversations':'Save conversation')} onClick={()=>updateSession(session.id,value=>({...value,saved:!value.saved}))}><Bookmark size={20} fill={session.saved?'currentColor':'none'}/></button></article>)}</div>{!shownSessions.length&&<div className="empty-state"><MessageCircle size={38}/><h2>{t(search?'No conversations found.':savedOnly?'No bookmarks yet.':'Your story starts here.')}</h2><button className="primary-button" onClick={newChat}>{t('Start a conversation')}<ArrowRight size={18}/></button></div>}<CloudAccount cloud={cloud}/></div>}
        {view==='learn'&&<div className="library-content"><div className="page-intro"><span className="eyebrow">{t('THE COMPLETE DECK')}</span><h1>{t('78 cards. A world of everyday stories.')}</h1><p>{t('Numbered exactly from The Fool (1) to King of Pentacles (78). Public-domain Rider–Waite–Smith artwork.')}</p></div><div className="deck-library-tools"><input aria-label={t('Find a card')} placeholder={t('Search by name or number')} value={deckSearch} onChange={event=>setDeckSearch(event.target.value)}/><SoftSelect aria-label={t('Card suit')} value={deckSuit} onChange={setDeckSuit} options={['all','major','wands','cups','swords','pentacles'].map(suit=>({value:suit,label:t({all:'All 78 cards',major:'Major Arcana',wands:'Wands',cups:'Cups',swords:'Swords',pentacles:'Pentacles'}[suit]!)}))}/></div><div className="card-library">{cards.filter(card=>(deckSuit==='all'||card.suit===deckSuit)&&(!deckSearch||`${card.id+1} ${card.name} ${tarotVi[card.id].name}`.toLocaleLowerCase(locale).includes(deckSearch.toLocaleLowerCase(locale)))).map(card=><button className="library-card" key={card.id} onClick={()=>setDetail(card)}><img src={card.image} alt={language==='vi'?tarotVi[card.id].name:card.name} loading="lazy"/><span className="eyebrow">{card.id+1} / 78</span><h2>{language==='vi'?tarotVi[card.id].name:t(card.name)}</h2></button>)}</div></div>}

      </div>
      {showComposer&&<footer className="composer-area chatgpt-composer">
        <form className="composer" onSubmit={submit}>
          <div className="input-row"><textarea ref={textareaRef} aria-label={t('Your message')} rows={2} maxLength={1000} value={input} disabled={busy} placeholder={t('Message Eva Tarot…')} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/></div>
          <div className="composer-toolbar">
            {view==='home'?<div className="spread-select"><Sparkles size={16}/><SoftSelect aria-label={t('Reading style')} value={spread} onChange={setSpread} placement="up" options={[...readingCounts.map(count=>({value:count,label:`${t(spreadLabels[count])}${count===10?' · 10':''}`})),{value:-1,label:t('Suggest a spread')}]}/></div>:<button type="button" className="composer-card-action" disabled={busy||loadingIds.size>0} onClick={addCards}><Sparkles size={16}/>{t(activeDraw.length?'New card reading':'Add cards')}</button>}
            <div className="composer-send-actions"><VoiceInput key={`${voiceContext}:${language}`} disabled={busy} onTranscript={text=>{setInput(previous=>`${previous}${previous?' ':''}${text}`.slice(0,1000));textareaRef.current?.focus();}} onMessage={setVoiceMessage}/><button className="send-button" type="submit" disabled={!input.trim()||busy} aria-label={t('Send message')}>{busy?<LoaderCircle className="spin" size={23}/>:<ArrowRight size={23}/>}</button></div>
          </div>
        </form>
        {voiceMessage&&<p className="voice-feedback" role="status">{voiceMessage}</p>}
        <div className="composer-caption"><button type="button" disabled={loadingIds.size>0} onClick={()=>{pendingAI.current=null;setShowReaderOptions(true);}}>{t(readerMode==='online'?'Online AI · messages sent for replies':'On-device AI · messages stay here')}<ChevronRight size={12}/></button><span>{saveLabel}</span></div>
      </footer>}
      {view!=='chat'&&<nav className="bottom-nav" aria-label={t('App navigation')}>{navItems.map(item=><button key={item.view} className={view===item.view?'active':''} aria-current={view===item.view?'page':undefined} onClick={()=>go(item.view)}><item.icon size={23}/><span>{t(item.label)}</span></button>)}</nav>}
    </main>
    {modal==='settings'&&<Modal title={t('Your personal space')} onClose={()=>setModal(null)}><div className="settings-content"><h2>{t('A space that feels like you.')}</h2><ProfilePhoto value={profile.avatar} onChange={avatar=>setProfile(previous=>({...previous,avatar}))} labels={{upload:t('Upload profile photo'),remove:t('Remove photo'),hint:t('JPG, PNG or WebP · up to 10 MB'),alt:t('Profile photo'),saving:t('Preparing your photo…'),invalid:t('Choose a JPG, PNG or WebP image.'),tooLarge:t('Please choose an image smaller than 10 MB.'),unreadable:t('This image could not be opened. Try another photo.')}}/><label className="field-label" htmlFor="profile-name">{t('What should we call you?')}</label><input id="profile-name" value={nameDraft} maxLength={32} onChange={event=>setNameDraft(event.target.value)}/><button className="primary-button" onClick={()=>{setProfile(previous=>({...previous,name:nameDraft.trim(),onboarded:true}));setToast(t('Your profile has been updated.'));}}>{t('Save my name')}<Check size={17}/></button><label className="field-label" htmlFor="app-language">{t('Language')}</label><SoftSelect id="app-language" aria-label={t('Language')} value={language} onChange={setLanguage} options={languages.map(item=>({value:item.code,label:item.label}))}/><p className="privacy-small">{t('English and Vietnamese are the primary languages. Some reference content may appear in English in other languages.')}</p><section className="settings-storage-note"><ShieldCheck size={19}/><div><h3>{t('Your saved data')}</h3><p>{saveLabel}</p></div></section><CloudAccount cloud={cloud}/><div className="settings-actions"><button className="secondary-button" onClick={()=>{setModal(null);pendingAI.current=null;setShowReaderOptions(true);}}><Settings2 size={18}/>{t('Reader options')}</button><button className="secondary-button" onClick={exportData}><Download size={18}/>{t('Export all my data')}</button><button className="secondary-button" disabled={importing} onClick={()=>importRef.current?.click()}>{importing?<LoaderCircle className="spin" size={18}/>:<Upload size={18}/>} {t(importing?'Importing your backup…':'Import a backup')}</button><input className="visually-hidden" tabIndex={-1} aria-hidden="true" ref={importRef} type="file" accept="application/json,.json" onChange={event=>void importData(event.target.files?.[0])}/><button className="secondary-button" onClick={()=>void data.requestDurability().then(granted=>setToast(t(granted?'Persistent storage is enabled.':'Your data still saves here. Keep an exported backup too.')))}><Heart size={18}/>{t('Keep data on this device')}</button><button className="secondary-button" onClick={()=>void install()}><Plus size={18}/>{t('Add to home screen')}</button><button className="text-button" onClick={()=>{setModal(null);go('learn');}}><Compass size={18}/>{t('Explore all the cards')}</button></div><p className="privacy-small">{t('Your data is saved in this browser, not an online account. Export a backup to move it to another device or keep an extra copy.')}</p></div></Modal>}
    {modal==='about'&&<Modal title={t('How Eva Tarot works')} onClose={()=>setModal(null)}><div className="about-content"><Logo size={57}/><h2>{t('Your intuition. A fresh perspective.')}</h2><p>{t('Start with your situation. Eva suggests a spread, then interprets the cards in the context of your conversation.')}</p><p>{t('Choose 1, 3, 5 or 10 cards from the complete 78-card deck. The illustrations are Rider–Waite–Smith, not Gilded Tarot.')}</p><p>{t('Your history and calendar keep your reflections together. Future dates hold intentions, not predictions.')}</p><div className="soft-note">{t('Online AI works without a download and sends your conversation to Eva’s server and AI provider for replies. On-device AI is an optional experimental reader. AI can make mistakes; readings offer perspectives, not predictions.')}</div><button className="primary-button" onClick={()=>{setModal(null);newChat();}}>{t('Start a conversation')}<ArrowRight size={17}/></button></div></Modal>}
    {modal==='install'&&<Modal title={t('Add Eva Tarot to your home screen')} onClose={()=>setModal(null)}><div className="about-content"><Logo size={60}/><h2>{t('A little closer, whenever you need.')}</h2><div className="install-steps"><strong>{t('On iPhone or iPad')}</strong><p>{t('Open Eva Tarot in Safari, tap Share, then choose “Add to Home Screen.”')}</p><strong>{t('On Android or desktop')}</strong><p>{t('Open your browser menu and choose “Install app” or “Add to Home Screen.”')}</p></div></div></Modal>}
    {translatedDetail&&<Modal title={translatedDetail.name} onClose={()=>setDetail(null)} className="card-detail-modal"><div className="card-detail"><span className="eyebrow">{translatedDetail.id+1} / 78 · {t(translatedDetail.id<22?'Major Arcana':'Minor Arcana')}</span><h2>{translatedDetail.name}</h2><img className="detail-art" src={translatedDetail.image} alt={translatedDetail.name}/><div className="keyword-pills">{translatedDetail.keywords.map(keyword=><span key={keyword}>{t(keyword)}</span>)}</div><CardGuidance cardId={translatedDetail.id}/><blockquote>{translatedDetail.reflection}</blockquote><button className="secondary-button close-card-details" onClick={()=>setDetail(null)}>{t('Close card details')}</button></div></Modal>}
    {showAI&&<LocalAISetup state={ai} preparing={preparingAI} startupError={aiStartupError} onEnable={()=>void enableAI()} onCancel={cancelReaderSetup} onClose={closeReaderSetup} onExplore={exploreFromSetup} onOnline={()=>chooseReader('online')} onReference={pendingAI.current?.drawn.length?showReference:undefined}/>}
    {showReaderOptions&&<ReaderOptions mode={readerMode} onChoose={chooseReader} onClose={()=>setShowReaderOptions(false)}/>}
    {showOnlineDisclosure&&<OnlineDisclosure onContinue={confirmOnline} onClose={closeOnlineDisclosure}/>}
    {modal==='language'&&<Modal title={t('Choose your language')} onClose={()=>setModal(null)}><div className="language-chooser"><Globe size={26}/><h2>{t('Choose your language')}</h2><p>{t('English and Vietnamese are fully supported. Other languages include translated core controls.')}</p><div className="language-options">{languages.map(item=><button key={item.code} lang={item.code} type="button" aria-pressed={language===item.code} onClick={()=>{setLanguage(item.code);setModal(null);}}><span>{item.label}</span>{language===item.code&&<Check size={18}/>}</button>)}</div></div></Modal>}
    {editing&&<EditReading session={editing.session} messageId={editing.messageId} onClose={()=>setEditing(null)} onSave={(title,note)=>{updateSession(editing.session.id,session=>({...session,title,note}));setEditing(null);setToast(t('Reading updated.'));}} onRevise={revise}/>}
    {toast&&<div className="toast" role="status"><Check size={18}/>{toast}<button onClick={()=>setToast('')} aria-label={t('Dismiss notification')}><X size={17}/></button></div>}
  </div>;
}
