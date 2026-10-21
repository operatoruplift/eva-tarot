export type SiteSurface = 'landing' | 'app' | 'pricing' | 'support' | 'admin';

export function siteSurface(hash: string, pathname: string): SiteSurface {
  if (/^#pricing(?:\?|$)/.test(hash)) return 'pricing';
  if (/^#(?:support|donate)$/.test(hash)) return 'support';
  if (hash === '#admin') return 'admin';
  if (/^#(?:chat|reading(?:\/.*)?|calendar|journal|breathe|cards|rituals|transfer\/.*)$/.test(hash)) return 'app';
  if (hash && !hash.startsWith('#access_token=') && !hash.startsWith('#error=')) return 'landing';
  if (/^\/admin\/?$/.test(pathname)) return 'admin';
  if (/^\/pricing\/?$/.test(pathname)) return 'pricing';
  if (/^\/(?:support|donate)\/?$/.test(pathname)) return 'support';
  if (/^\/(?:chat|reading(?:\/.*)?|calendar|journal|breathe|cards|rituals)\/?$/.test(pathname)) return 'app';
  return 'landing';
}
