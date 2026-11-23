// US-PHONE-23 · Add hlabs to the home screen: the manifest and its icons (US-INST-28's, built), iOS's
// apple-touch-icon and meta tags, a worker that keeps only the shell, and the one-time "Add to Home Screen" hint on
// iOS Safari. Serving them without a session and Chrome's installability are checked in e2e (the pwa project).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isIosSafari } from '../lib/install-app';
import { NEVER_CACHED, PWA_THEME, pwaManifest } from '../pwa-options';
import tokens from '../../../../docs/design/tokens.json' with { type: 'json' };
import { IOS_HINT_KEY, IosInstallHint, resetIosHint } from './ios-install-hint';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function as(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

beforeEach(() => {
  localStorage.clear();
  resetIosHint();
});
afterEach(() => vi.restoreAllMocks());

describe('US-PHONE-23', () => {
  it('the manifest: hlabs, standalone from / and the colours from the design tokens, with its icons', () => {
    const wall = (tokens as { color: { tokens: Array<{ name: string; value: string }> } }).color.tokens.find(
      (t) => t.name === 'wall-base',
    )!.value;
    expect(PWA_THEME).toBe(wall);
    expect(pwaManifest).toMatchObject({
      name: 'hlabs',
      short_name: 'hlabs',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: wall,
      background_color: wall,
    });
    expect(pwaManifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it("iOS's icon and title: a 180 px apple-touch-icon, apple-mobile-web-app-capable and the title hlabs", () => {
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="hlabs" />');
    const png = readFileSync(resolve(__dirname, '../../public/icons/apple-touch-icon-180.png'));
    // PNG header, then the IHDR's width and height.
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });

  it('the worker never keeps /trpc, /api or /auth', () => {
    for (const path of ['/trpc/apps.list', '/api/files', '/auth/login']) expect(NEVER_CACHED.test(path)).toBe(true);
    expect(NEVER_CACHED.test('/assets/index.js')).toBe(false);
  });

  it('knows iOS Safari from other browsers on an iPhone', () => {
    expect(isIosSafari(IPHONE)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(ANDROID)).toBe(false);
    // iPadOS asks for the desktop site.
    expect(
      isIosSafari(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        5,
      ),
    ).toBe(true);
    expect(
      isIosSafari(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        0,
      ),
    ).toBe(false);
  });

  it('iOS Safari, not installed: a one-time hint with Dismiss, remembered in this browser', () => {
    as(IPHONE);
    const { unmount } = render(<IosInstallHint shippedPhase={9} />);
    // Named with the story's words; drawn as PhoneRedesignA_AddToHomeScreen: a title, then the steps.
    const hint = screen.getByRole('note', {
      name: 'Add hlabs to your Home Screen: tap Share, then Add to Home Screen.',
    });
    expect(hint).toHaveTextContent('Add hlabs to your Home Screen');
    expect(hint).toHaveTextContent('Tap Share, then Add to Home Screen.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(localStorage.getItem(IOS_HINT_KEY)).toBe('1');
    unmount();
    resetIosHint();
    render(<IosInstallHint shippedPhase={9} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('no hint in the home-screen app, on other browsers, or before phase 7', () => {
    as(ANDROID);
    const { unmount } = render(<IosInstallHint shippedPhase={9} />);
    expect(screen.queryByRole('note')).toBeNull();
    unmount();
    as(IPHONE);
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const second = render(<IosInstallHint shippedPhase={9} />);
    expect(screen.queryByRole('note')).toBeNull();
    second.unmount();
    delete (navigator as { standalone?: boolean }).standalone;
    render(<IosInstallHint shippedPhase={4} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('without storage the dismissal holds for this visit', () => {
    as(IPHONE);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { unmount } = render(<IosInstallHint shippedPhase={9} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    unmount();
    render(<IosInstallHint shippedPhase={9} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
