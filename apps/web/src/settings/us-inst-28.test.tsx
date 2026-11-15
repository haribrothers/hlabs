// US-INST-28 · Install hlabs as an app on my computer: the web manifest and the worker's rules (pwa-options), which
// browser this is, and "Use hlabs as an app" in Settings › Account for each browser, with the tailnet address when
// remote access is on. The built manifest, worker and installability are checked in e2e (the pwa project).
import { helpUrl } from '@hlabs/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { browserKind, isStandalone, resetInstall } from '../lib/install-app';
import { NEVER_CACHED, PWA_THEME, pwaManifest, pwaWorkbox, shellOnly } from '../pwa-options';
import { fakeAccount } from '../test/account';
import { renderScreen } from '../test/render';
import { INSTALL_HELP, ThisComputer } from './this-computer';

afterEach(() => {
  resetInstall();
  vi.unstubAllGlobals();
});

const UA = {
  chrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
};

describe('US-INST-28 · the manifest and the worker', () => {
  it('names hlabs, opens standalone at / and takes its colours from the wallpaper token', () => {
    expect(PWA_THEME).toBe('#1a1238');
    expect(pwaManifest).toMatchObject({
      id: '/',
      name: 'hlabs',
      short_name: 'hlabs',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: PWA_THEME,
      background_color: PWA_THEME,
    });
    expect(pwaManifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it('pages come from the network; the shell only when nothing answers; API and auth never', () => {
    expect(pwaWorkbox.navigateFallback).toBeNull();
    expect(pwaWorkbox.directoryIndex).toBe('');
    const [route] = pwaWorkbox.runtimeCaching;
    expect(route!.handler).toBe('NetworkOnly');
    expect(route!.options.precacheFallback.fallbackURL).toBe('/index.html');
    vi.stubGlobal('self', { location: { origin: 'https://hlabs.local' } });
    const page = (path: string, mode = 'navigate') =>
      route!.urlPattern({ request: { mode } as Request, url: new URL(path, 'https://hlabs.local') });
    expect(page('/')).toBe(true);
    expect(page('/settings/account')).toBe(true);
    for (const path of ['/trpc/auth.me', '/api/apps/x/logs/download', '/auth/verify', '/healthz', '/dev/sign-in']) {
      expect(page(path)).toBe(false);
      expect(NEVER_CACHED.test(path)).toBe(true);
    }
    expect(page('/assets/index.js', 'no-cors')).toBe(false);
    expect(
      route!.urlPattern({ request: { mode: 'navigate' } as Request, url: new URL('https://immich.hlabs.local/') }),
    ).toBe(false);
  });

  it('keeps only the shell: index.html, what it loads, fonts and icons, not every lazy chunk', () => {
    const html =
      '<script src="/assets/index-1.js"></script><link href="/assets/react-2.js"><link href="/assets/index-3.css">';
    const entries = [
      'index.html',
      'assets/index-1.js',
      'assets/react-2.js',
      'assets/index-3.css',
      'assets/plus-jakarta-sans-400.woff2',
      'icons/icon-192.png',
      'assets/camera-9.js',
      'assets/settings-route-8.js',
    ].map((url) => ({ url, revision: null, size: 1 }));
    expect(shellOnly(html)(entries).manifest.map((e) => e.url)).toEqual([
      'index.html',
      'assets/index-1.js',
      'assets/react-2.js',
      'assets/index-3.css',
      'assets/plus-jakarta-sans-400.woff2',
      'icons/icon-192.png',
    ]);
  });
});

describe('US-INST-28 · which browser', () => {
  it.each([
    ['chrome', 'chromium'],
    ['edge', 'chromium'],
    ['safari', 'safari'],
    ['firefox', 'other'],
    ['iphone', 'other'],
  ] as const)('%s is %s', (ua, kind) => {
    expect(browserKind(UA[ua])).toBe(kind);
  });

  it('knows when it runs as the installed app', () => {
    const win = { matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' }) } as unknown as Window;
    expect(isStandalone(win)).toBe(true);
    expect(isStandalone({ matchMedia: () => ({ matches: false }) } as unknown as Window)).toBe(false);
  });
});

describe('US-INST-28 · "Use hlabs as an app" in Settings › Account', () => {
  const card = (account: Record<string, unknown> = {}) =>
    renderScreen(ThisComputer, { 'account.get': fakeAccount(account) }, { path: '/settings/account' });
  const group = async () => screen.findByRole('group', { name: 'This computer' });
  const intro = 'Open hlabs in its own window from your Dock or Start menu, without a browser tab.';

  it('Chrome or Edge, once they offer it: Install hlabs opens their prompt; installed, it says so', async () => {
    let choose!: (outcome: 'accepted' | 'dismissed') => void;
    const prompt = {
      prompt: vi.fn(async () => {}),
      userChoice: new Promise<{ outcome: 'accepted' | 'dismissed' }>((r) => (choose = (outcome) => r({ outcome }))),
    } as unknown as Parameters<typeof resetInstall>[1];
    resetInstall({ browser: 'chromium' }, prompt);
    card();
    const g = await group();
    expect(within(g).getByText('Use hlabs as an app')).toBeInTheDocument();
    expect(within(g).getByText(intro)).toBeInTheDocument();
    fireEvent.click(within(g).getByRole('button', { name: 'Install hlabs' }));
    await waitFor(() => expect(prompt!.prompt).toHaveBeenCalledOnce());
    await act(async () => choose('accepted'));
    expect(await within(g).findByText('hlabs is installed on this computer.')).toBeInTheDocument();
    expect(within(g).queryByRole('button', { name: 'Install hlabs' })).toBeNull();
  });

  it('Safari: In Safari, choose File › Add to Dock.', async () => {
    resetInstall({ browser: 'safari' });
    card();
    const g = await group();
    expect(within(g).getByText('In Safari, choose File › Add to Dock.')).toBeInTheDocument();
    expect(within(g).queryByRole('button')).toBeNull();
  });

  it.each(['other', 'chromium'] as const)(
    'a browser that can’t install it (%s, or Chrome without the offer): which to use, and How to install',
    async (kind) => {
      resetInstall({ browser: kind });
      card();
      const g = await group();
      expect(within(g).getByText('To install hlabs, open it in Chrome, Edge or Safari.')).toBeInTheDocument();
      expect(within(g).getByRole('link', { name: 'How to install' })).toHaveAttribute('href', helpUrl(INSTALL_HELP));
    },
  );

  it('remote access on and not on the tailnet address: install it from there, so it works at home and away', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    resetInstall({ browser: 'chromium' });
    card({ tailnetUrl: 'https://hlabs.tail4f2a.ts.net' });
    const g = await group();
    expect(
      await within(g).findByText('Install it from your tailnet address so the app works at home and away.'),
    ).toBeInTheDocument();
    expect(within(g).getByText('https://hlabs.tail4f2a.ts.net')).toBeInTheDocument();
    fireEvent.click(within(g).getByRole('button', { name: 'Open tailnet address' }));
    expect(open).toHaveBeenCalledWith('https://hlabs.tail4f2a.ts.net');
  });

  it('already on the tailnet address, or remote access off: no second row', async () => {
    resetInstall({ browser: 'chromium' });
    card({ tailnetUrl: `${window.location.protocol}//${window.location.host}` });
    const g = await group();
    expect(within(g).queryByText(/tailnet address/)).toBeNull();
  });

  it('hidden in the installed app itself, and on a phone', async () => {
    resetInstall({ browser: 'chromium', standalone: true });
    const { unmount } = card();
    await waitFor(() => expect(screen.queryByText('Use hlabs as an app')).toBeNull());
    unmount();
    resetInstall({ browser: 'chromium' });
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: !q.includes('min-width'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    card();
    await waitFor(() => expect(screen.queryByText('Use hlabs as an app')).toBeNull());
  });
});
