// US-TAB-01 · Touch-sized controls on a tablet: the input decides (a touch screen with no mouse at 768px and wider sets
// <html data-input="touch">, following the media query live), every touch rule is scoped to it so a computer with a
// mouse and a phone are unchanged, controls are 44px and fields 16px, and Home shows Edit Home as a button, the
// tablet's greeting and a search pill without keys. Sizes are measured in the browser (e2e/us-tab-01.spec.ts).
import { TOUCH_QUERY, watchInputMode } from '@hlabs/ui';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from '../home/home-view';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { tabletViewport } from '../test/tablet';

const css = readFileSync(resolve(__dirname, '../../../../packages/ui/src/styles/tablet.css'), 'utf8');
const never = () => new Promise(() => {});

/** A matchMedia whose answer for TOUCH_QUERY can change, as plugging in a mouse changes it. */
function liveMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === TOUCH_QUERY ? matches : false;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      matches = next;
      for (const fn of listeners) fn();
    },
    restore: () => {
      window.matchMedia = original;
    },
  };
}

afterEach(() => {
  document.documentElement.removeAttribute('data-input');
  vi.restoreAllMocks();
});

describe('US-TAB-01', () => {
  it('touch is the input, not the width: a touch screen with no mouse at 768px and wider', () => {
    expect(TOUCH_QUERY).toBe('(min-width: 768px) and (hover: none) and (pointer: coarse)');
  });

  it('data-input="touch" follows the media query live: a mouse plugged in takes it away without a reload', () => {
    const media = liveMedia(true);
    const stop = watchInputMode();
    expect(document.documentElement).toHaveAttribute('data-input', 'touch');
    media.set(false);
    expect(document.documentElement).not.toHaveAttribute('data-input');
    media.set(true);
    expect(document.documentElement).toHaveAttribute('data-input', 'touch');
    stop();
    media.set(false);
    // Stopped: no longer followed.
    expect(document.documentElement).toHaveAttribute('data-input', 'touch');
    media.restore();
  });

  it('every touch rule is scoped to data-input="touch", so the desktop with a mouse and phones are unchanged', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}@;]+\{/g) ?? [];
    const selectors = rules.map((r) => r.slice(0, -1).trim()).filter((s) => s && !/^(layer|media) /.test(s));
    for (const sel of selectors) {
      for (const part of sel.split(',').map((p) => p.trim())) {
        // Classes only the touch layout renders (.hl-t-*, .hl-touch-*), the media queries' own rules, or the touch
        // attribute.
        expect(part, part).toMatch(/^\[data-input='touch'\]|^\.hl-t-|^\.hl-touch-|^:root\[data-vgap\]/);
      }
    }
  });

  it('buttons, tabs, switches and menu rows are 44px at least; fields 16px', () => {
    expect(css).toMatch(
      /\[data-input='touch'\] \.hl-btn-sm,\s*\[data-input='touch'\] \.hl-btn-md \{[^}]*height: var\(--size-control\)/,
    );
    expect(css).toMatch(/\[data-input='touch'\] \.hl-iconbtn \{[^}]*width: var\(--size-control\)/);
    expect(css).toMatch(/\[data-input='touch'\] \.hl-switch,[^{]*\{[^}]*height: var\(--size-control\)/);
    expect(css).toMatch(/\[data-input='touch'\] \.hl-seg-opt \{[^}]*height: var\(--size-control\)/);
    expect(css).toMatch(/\[data-input='touch'\] \.hl-menu-item \{[^}]*min-height: var\(--size-row\)/);
    expect(css).toMatch(/\[data-input='touch'\] select \{\s*font-size: max\(var\(--size-field-text-touch\), 1em\)/);
    // What a computer shows on hover is there all the time, a finger's size.
    expect(css).toMatch(/\[data-input='touch'\] \.hl-hover-reveal \{[^}]*opacity: 1 !important/);
  });

  it('Home on a tablet: Edit Home beside the bell, the 40px greeting, and search without keyboard keys', async () => {
    const restore = tabletViewport();
    try {
      renderScreen(() => <HomeView shippedPhase={9} />, {
        'auth.me': fakeMe(),
        'home.getLayout': () => ({ items: [], hidden: [], dock: [] }),
        'apps.list': () => ({
          apps: [
            {
              id: 'jellyfin',
              name: 'Jellyfin',
              state: 'running',
              icon: { logoUrl: null, gradient: null, fallback: null },
              embed: false,
              ownLogin: false,
              urls: { local: 'https://jellyfin.hlabs.local', tailnet: null, port: null },
            },
          ],
        }),
        'notifications.unreadCount': () => ({ count: 0 }),
        'events.stream': never,
      });
      expect(await screen.findByRole('button', { name: 'Edit Home' })).toHaveClass('hl-p-ibtn');
      expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-display');
      const search = screen.getByRole('button', { name: /Search apps, files, settings/ });
      expect(search.querySelector('kbd')).toBeNull();
    } finally {
      restore();
    }
  });
});
