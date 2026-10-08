/* Only public application assets are stored here. Readings and API responses are never cached. */
const CACHE_PREFIX = 'evara-public-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const SHELL_URL = '/index.html';
const CARD_SLUGS = [
  'the-fool', 'the-magician', 'the-high-priestess', 'the-empress', 'the-emperor',
  'the-hierophant', 'the-lovers', 'the-chariot', 'strength', 'the-hermit',
  'wheel-of-fortune', 'justice', 'the-hanged-man', 'death', 'temperance',
  'the-devil', 'the-tower', 'the-star', 'the-moon', 'the-sun', 'judgement', 'the-world',
];
const PUBLIC_ASSETS = [
  '/fonts/cormorant-vietnamese.woff2', '/fonts/cormorant-latin-ext.woff2', '/fonts/inter-vietnamese.woff2', '/fonts/inter-latin-ext.woff2',
  '/manifest.json', '/icons/logo.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
  '/fonts/cormorant-garamond-latin-500-normal.woff2',
  '/fonts/cormorant-garamond-latin-600-normal.woff2',
  '/fonts/inter-latin-400-normal.woff2',
  '/fonts/inter-latin-500-normal.woff2',
  '/fonts/inter-latin-600-normal.woff2',
  ...CARD_SLUGS.map((slug) => `/cards/${slug}.jpg`),
  ...['wands','cups','swords','pentacles'].flatMap(suit => ['ace','two','three','four','five','six','seven','eight','nine','ten','page','knight','queen','king'].map(rank => `/cards/${rank}-of-${suit}.jpg`)),
];

function isPublicAsset(url) {
  return url.origin === self.location.origin && !url.search && (
    PUBLIC_ASSETS.includes(url.pathname) ||
    /^\/assets\/[^/]+\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/.test(url.pathname)
  );
}

/* Cache the entry bundles before replacing the offline shell, so its hashed URLs exist. */
async function cacheShell(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
  const html = await response.clone().text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => isPublicAsset(url) && /\.(?:js|css)$/.test(url.pathname));
  // Development entry modules are deliberately not stored as an offline application.
  if (!assetUrls.length) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(assetUrls.map(async (url) => {
    if (await cache.match(url.href)) return;
    const asset = await fetch(url.href, { cache: 'reload' });
    if (!asset.ok) throw new Error(`Unable to cache application asset: ${url.pathname}`);
    await cache.put(url.href, asset);
  }));
  await cache.put(SHELL_URL, response.clone());
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await fetch(SHELL_URL, { cache: 'reload' });
    await cacheShell(shell);
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PUBLIC_ASSETS);
  })());
  // An updated worker waits for existing pages to close before it takes over.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (!response.ok) throw new Error('Application temporarily unavailable');
        // Keep the current offline page if a newly deployed asset cannot be fetched.
        event.waitUntil(cacheShell(response.clone()).catch(() => undefined));
        return response;
      } catch {
        const shell = await caches.match(SHELL_URL);
        if (shell) return shell;
        return new Response('Eva Tarot is offline. Please reconnect to open your space for the first time.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  if (!isPublicAsset(url)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  })());
});
