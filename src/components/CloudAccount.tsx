import { useLanguage } from '../lib/i18n';
import { Check, Cloud, CloudOff, RefreshCw, ShieldCheck } from 'lucide-react';
import type { CloudJournal } from '../lib/cloud';
import './cloud.css';

export function CloudAccount({ cloud }: { cloud: CloudJournal }) {
  const { t, formatDate } = useLanguage();
  if (!cloud.available) return null;
  const busy = cloud.status === 'connecting' || cloud.status === 'syncing';
  const label = cloud.status === 'connecting' ? 'Connecting your private backup…'
    : cloud.status === 'syncing' ? 'Saving your latest moments…'
      : cloud.status === 'offline' ? 'Offline · changes stay on this device'
        : cloud.status === 'synced' ? 'Your private backup is up to date'
          : cloud.enabled ? 'Your journal is saved on this device' : 'A little extra peace of mind';
  return <section className="cloud-account" aria-label={t("Private device backup")}>
    <div className="cloud-heading"><span className="cloud-icon"><Cloud size={21}/></span><div><h3>{t("Private device backup")}</h3><p>{t(label)}</p></div></div>
    <p className="cloud-description">{t("Optionally save your name, readings and notes to Eva Tarot’s secure cloud. This connection belongs to this browser; it is not an email account or cross-device sync.")}</p>
    <p className="cloud-storage-note"><ShieldCheck size={15}/><span>{t("Keep an exported copy. Clearing browser data loses this device’s backup connection.")}</span></p>
    {cloud.error && <p className="cloud-error" role="alert">{t(cloud.error)}</p>}
    <div className="cloud-actions">
      {!cloud.enabled ? <button className="secondary-button" onClick={cloud.enable}><Cloud size={17}/>{t("Enable private backup")}</button>
        : <>{cloud.status === 'error' && <button className="secondary-button" onClick={cloud.retry}><RefreshCw size={16}/>{t(cloud.conflict ? 'Back up this device’s version' : 'Try backup again')}</button>}
          {cloud.status === 'synced' && <span className="cloud-saved" role="status"><Check size={16}/>{t('Saved')}{cloud.lastSynced ? ` ${formatDate(new Date(cloud.lastSynced), { hour: 'numeric', minute: '2-digit' })}` : ''}</span>}
          {busy && <span className="cloud-saving" role="status"><RefreshCw size={16}/>{t(cloud.status === 'connecting' ? 'Connecting' : 'Saving')}</span>}
          <button className="text-button" onClick={cloud.disconnect}><CloudOff size={16}/>{t("Pause backup")}</button></>}
    </div>
    {cloud.conflict && <p className="cloud-storage-note">{t("Another open tab changed this backup. Continuing keeps this device’s version of shared readings, plus readings found only in the cloud.")}</p>}
    {!cloud.enabled && <p className="cloud-storage-note">{t("Pausing keeps existing cloud data and your browser connection. You can resume here later.")}</p>}
  </section>;
}
