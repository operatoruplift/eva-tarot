import { useId, useRef, useState } from 'react';
import { Camera, LoaderCircle, Trash2, UserRound } from 'lucide-react';
import type { Profile } from '../lib/storage';
import './profile.css';

type Labels = { upload: string; remove: string; hint: string; alt: string; saving: string; invalid: string; tooLarge: string; unreadable: string };
const defaults: Labels = {
  upload: 'Choose a photo', remove: 'Remove photo', hint: 'JPEG, PNG or WebP · up to 10 MB. Saved with your profile on this device.',
  alt: 'Your profile photo', saving: 'Preparing photo…', invalid: 'Choose a JPEG, PNG or WebP photo.', tooLarge: 'Choose a photo smaller than 10 MB.', unreadable: 'This photo could not be opened. Try a different image.',
};

export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('invalid');
  if (file.size > 10 * 1024 * 1024) throw new Error('tooLarge');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('unreadable')); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('unreadable');
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('unreadable');
    context.fillStyle = '#FDFBF7'; context.fillRect(0, 0, 256, 256);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL('image/jpeg', 0.84);
  } finally { URL.revokeObjectURL(url); }
}

export function ProfileAvatar({ profile, size = 44 }: { profile: Profile; size?: number }) {
  return <span className="profile-avatar-image" style={{ width: size, height: size }}>
    {profile.avatar ? <img src={profile.avatar} alt="" /> : profile.name ? profile.name.slice(0, 1).toUpperCase() : <UserRound size={size * 0.46} aria-hidden="true" />}
  </span>;
}

export function ProfilePhoto({ value, onChange, labels: overrides }: { value?: string; onChange: (avatar?: string) => void; labels?: Partial<Labels> }) {
  const labels = { ...defaults, ...overrides };
  const id = useId(); const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try { onChange(await prepareProfilePhoto(file)); }
    catch (cause) { const code = cause instanceof Error ? cause.message : 'unreadable'; setError(labels[code === 'invalid' || code === 'tooLarge' ? code : 'unreadable']); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <div className="profile-photo-editor">
    <div className="profile-photo-preview">{value ? <img src={value} alt={labels.alt} /> : <UserRound size={37} aria-hidden="true" />}</div>
    <div className="profile-photo-controls">
      <input className="profile-photo-input" ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label={labels.upload} aria-describedby={`${id}-hint`} onChange={event => void upload(event.target.files?.[0])} />
      <label className={`secondary-button profile-photo-label ${busy ? 'is-busy' : ''}`} htmlFor={id}>{busy ? <LoaderCircle className="photo-spinner" size={17} /> : <Camera size={17} />}{busy ? labels.saving : labels.upload}</label>
      {value && <button type="button" className="text-button profile-photo-remove" disabled={busy} onClick={() => { onChange(undefined); setError(''); }}><Trash2 size={15} />{labels.remove}</button>}
    </div>
    <p id={`${id}-hint`} className="profile-photo-hint">{labels.hint}</p>
    {error && <p className="profile-photo-error" role="alert">{error}</p>}
  </div>;
}
