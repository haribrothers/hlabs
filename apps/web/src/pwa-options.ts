// The installable dashboard (US-INST-28, US-INST-29, D-126): its web manifest and service worker, for vite-plugin-pwa
// (vite.config.ts). The worker keeps the built shell for opening offline and never anything else: pages come from
// the network first (so an update shows at once) and fall back to the saved shell only when nothing answers;
// /trpc, /api, /auth, /healthz and /dev are never cached or answered by it.
import tokens from '../../../docs/design/tokens.json' with { type: 'json' };

const token = (name: string): string => {
  const found = (tokens as { color: { tokens: Array<{ name: string; value: unknown }> } }).color.tokens.find(
    (t) => t.name === name,
  );
  if (typeof found?.value !== 'string') throw new Error(`no colour token ${name}`);
  return found.value;
};

/** The window's title bar and splash: the wallpaper's base colour. */
export const PWA_THEME = token('wall-base');

/** Paths that are hlabs's API or auth, never the shell (a navigation to them goes straight to the network). */
export const NEVER_CACHED = /^\/(trpc|api|auth|healthz|dev|mcp)(\/|$)/;

export const pwaManifest = {
  id: '/',
  name: 'hlabs',
  short_name: 'hlabs',
  description: 'Your own cloud, running on your computer.',
  start_url: '/',
  scope: '/',
  display: 'standalone' as const,
  theme_color: PWA_THEME,
  background_color: PWA_THEME,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/**
 * Only the shell is kept: index.html and what it loads (its script, CSS and the chunks it preloads), the fonts and
 * the app icons. Not every lazy chunk: the build splits Lucide into one file per icon (about 1,900), and offline the
 * page only needs to say "Can't reach hlabs". `html` is the built index.html.
 */
export function shellOnly(html: string) {
  const loaded = new Set([...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map((m) => m[1]));
  return <T extends { url: string }>(entries: T[]) => ({
    manifest: entries.filter(
      (e) => e.url === 'index.html' || loaded.has(e.url) || /\.woff2$/.test(e.url) || e.url.startsWith('icons/'),
    ),
    warnings: [] as string[],
  });
}

/** Workbox (generateSW): the built shell precached; pages network first with that shell as the offline fallback. */
export const pwaWorkbox = {
  globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
  // Source maps are never needed offline.
  globIgnores: ['**/*.map'],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  navigateFallback: null,
  // "/" is never answered from the cache: a page is the network's while it answers (an update shows at once).
  directoryIndex: '',
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Copied into sw.js as text, so the pattern is written out here (it is NEVER_CACHED).
      urlPattern: ({ request, url }: { request: Request; url: URL }) =>
        request.mode === 'navigate' &&
        url.origin === self.location.origin &&
        !/^\/(trpc|api|auth|healthz|dev|mcp)(\/|$)/.test(url.pathname),
      handler: 'NetworkOnly' as const,
      // Nothing answered: the saved shell, which shows "Can't reach hlabs" (AppOffline) until hlabs answers.
      options: { precacheFallback: { fallbackURL: '/index.html' } },
    },
  ],
};
