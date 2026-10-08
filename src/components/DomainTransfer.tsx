import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { createDataExport, parseDataImport } from '../lib/persistence';
import type { PersonalData } from '../lib/storage';
import { useLanguage } from '../lib/i18n';

const OLD_ORIGIN='https://evara-omega.vercel.app';
const NEW_ORIGIN='https://evatarot.vercel.app';
type Imported=ReturnType<typeof parseDataImport>;

/** A user-initiated handoff between our two exact origins. No journal text is
 * placed in a URL or sent to a server. The old browser copy is retained. */
export function DomainTransfer({data,language,saved,onImport}:{data:PersonalData;language:string;saved:boolean;onImport:(data:Imported)=>Promise<void>}) {
  const {t}=useLanguage();const [status,setStatus]=useState('');
  const [pendingAck,setPendingAck]=useState<{opener:Window;nonce:string}|null>(null);
  const latest=useRef({data,language,onImport});latest.current={data,language,onImport};
  const cleanup=useRef<()=>void>(()=>{});
  useEffect(()=>{
    const nonce=window.location.hash.match(/^#transfer\/([a-f0-9-]{36})$/)?.[1];
    if(window.location.origin!==NEW_ORIGIN||!nonce||!window.opener)return;
    const opener=window.opener as Window;let received=false;let active=true;
    const receive=async(event:MessageEvent)=>{
      if(received||event.origin!==OLD_ORIGIN||event.source!==opener||event.data?.type!=='eva-transfer-data'||event.data.nonce!==nonce||typeof event.data.payload!=='string')return;
      try{const imported=parseDataImport(event.data.payload);received=true;setStatus('Your data is copied into this tab. Saving it now…');await latest.current.onImport(imported);if(active)setPendingAck({opener,nonce});}
      catch{if(active)setStatus('The transfer could not be completed. Export a backup from the old address and import it here.');}
    };
    const announce=()=>{if(!received)opener.postMessage({type:'eva-transfer-ready',nonce},OLD_ORIGIN);};
    window.addEventListener('message',receive);announce();const timer=setInterval(announce,1000);const timeout=setTimeout(()=>clearInterval(timer),60_000);
    return()=>{active=false;window.removeEventListener('message',receive);clearInterval(timer);clearTimeout(timeout);};
  },[]);
  useEffect(()=>()=>cleanup.current(),[]);
  useEffect(()=>{if(!pendingAck||!saved)return;pendingAck.opener.postMessage({type:'eva-transfer-done',nonce:pendingAck.nonce},OLD_ORIGIN);setPendingAck(null);setStatus('Your saved space has moved. Your old copy is still available.');},[pendingAck,saved]);
  function move(){
    cleanup.current();const nonce=crypto.randomUUID();
    const destination=window.open(`${NEW_ORIGIN}/#transfer/${nonce}`,`eva-tarot-transfer-${nonce}`);
    if(!destination){setStatus('Allow the new tab, or export a backup and open evatarot.vercel.app.');return;}
    setStatus('Opening your new space…');
    const receive=(event:MessageEvent)=>{
      if(event.origin!==NEW_ORIGIN||event.source!==destination||event.data?.nonce!==nonce)return;
      if(event.data.type==='eva-transfer-ready')destination.postMessage({type:'eva-transfer-data',nonce,payload:createDataExport(latest.current.data,latest.current.language)},NEW_ORIGIN);
      if(event.data.type==='eva-transfer-done'){setStatus('Your saved space has moved. Your old copy is still available.');cleanup.current();}
    };
    const timer=setTimeout(()=>{cleanup.current();setStatus('The transfer could not be completed. Export a backup from the old address and import it here.');},60_000);
    cleanup.current=()=>{window.removeEventListener('message',receive);clearTimeout(timer);};window.addEventListener('message',receive);
  }
  if(window.location.origin!==OLD_ORIGIN&&!status)return null;
  return <div className="transfer-banner" role="status"><span>{t(status||'Evara is now Eva Tarot. Bring your saved readings to our new address.')}</span>{window.location.origin===OLD_ORIGIN&&<button onClick={move}>{t('Move my saved data')}<ArrowUpRight size={13}/></button>}</div>;
}
