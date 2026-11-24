// US-TAB-06 · The on-screen keyboard and the Home Screen app on a tablet: the keyboard is noticed from the visual
// viewport on an iPad as on a phone (data-keyboard, the field scrolled into view), the Dock steps aside and dialogs sit
// in what's left of the screen; as a Home Screen app the Dock floats above the home indicator, windows start below the
// status bar, and iOS 26's band (data-vgap) takes the wallpaper's base colour at 768px and wider while a phone keeps
// its tab bar's.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchPhoneViewport } from './phone-viewport';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const tablet = read('../../../../packages/ui/src/styles/tablet.css');
const html = read('../../index.html');

afterEach(() => {
  document.documentElement.removeAttribute('data-keyboard');
  document.documentElement.style.removeProperty('--hl-visual-height');
});

/** A window whose visual viewport can shrink, as the iPad's does when its keyboard opens. */
function ipadWindow() {
  const listeners = new Set<() => void>();
  const vv = {
    height: 1180,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  const win = Object.create(window, {
    visualViewport: { value: vv },
    innerHeight: { value: 1180 },
    document: { value: document },
  }) as Window;
  return {
    win,
    resize(height: number) {
      vv.height = height;
      for (const fn of listeners) fn();
    },
  };
}

describe('US-TAB-06', () => {
  it("the iPad's keyboard is noticed: data-keyboard, the visible height, and the field scrolled into view", () => {
    const { win, resize } = ipadWindow();
    const field = document.createElement('input');
    field.scrollIntoView = vi.fn();
    document.body.append(field);
    const stop = watchPhoneViewport(win);
    field.focus();
    resize(780);
    expect(document.documentElement).toHaveAttribute('data-keyboard', 'open');
    expect(document.documentElement.style.getPropertyValue('--hl-visual-height')).toBe('780px');
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    resize(1180);
    expect(document.documentElement).not.toHaveAttribute('data-keyboard');
    stop();
    field.remove();
  });

  it('with the keyboard up the Dock steps aside and dialogs fit what is left of the screen', () => {
    expect(tablet).toMatch(/\[data-input='touch'\]\[data-keyboard='open'\] \.hl-nav-desktop \{\s*display: none/);
    expect(tablet).toMatch(
      /\[data-input='touch'\]\[data-keyboard='open'\] \.hl-dialog-modal,[^{]*\{[^}]*top: calc\(var\(--hl-visual-height, 100dvh\) \/ 2\)[^}]*max-height: calc\(var\(--hl-visual-height, 100dvh\)/,
    );
  });

  it('as a Home Screen app: no Safari bars, the Dock above the home indicator, windows below the status bar', () => {
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
    expect(html).toMatch(/viewport-fit=cover/);
    expect(tablet).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(tablet).toMatch(
      /--hl-window-top: calc\(var\(--space-2\) \+ max\(var\(--space-6\), env\(safe-area-inset-top\)\)\)/,
    );
    expect(tablet).toMatch(/padding-left: calc\(var\(--space-6\) \+ env\(safe-area-inset-left\)\)/);
  });

  it("iOS 26's band under the app takes the wallpaper's base colour on a tablet; the phone keeps its tab bar's", () => {
    expect(tablet).toMatch(
      /@media \(min-width: 768px\) \{\s*:root\[data-vgap\],\s*:root\[data-vgap\] body \{\s*background-color: var\(--wall-base\)/,
    );
    // index.html measures the band on any iPhone or iPad Home Screen app.
    expect(html).toMatch(/iPhone\|iPad\|iPod/);
  });
});
