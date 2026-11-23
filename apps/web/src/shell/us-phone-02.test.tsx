// US-PHONE-02 · Touch targets, safe areas and phone-friendly inputs: the viewport meta, the safe-area padding, 16 px
// fields, the keyboard hiding the tab bar and bringing the field into view, and controls that only appear on hover.
// Hit areas are measured in the browser (e2e/us-phone-02.spec.ts).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyboardOpen, watchPhoneViewport } from '../lib/phone-viewport';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const app = read('../app.css');
const ui = read('../../../../packages/ui/src/styles/phone.css');

afterEach(() => {
  document.documentElement.removeAttribute('data-keyboard');
  document.documentElement.style.removeProperty('--hl-visual-height');
});

describe('US-PHONE-02', () => {
  it('the viewport covers the notch and pinch zoom stays on', () => {
    const html = read('../../index.html');
    const meta = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1];
    expect(meta).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
    expect(meta).not.toMatch(/user-scalable|maximum-scale/);
  });

  it('the page clears the top and side insets; the tab bar and sheets the bottom one', () => {
    expect(app).toMatch(
      /\.hl-page \{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-left\)[^}]*env\(safe-area-inset-right\)[^}]*env\(safe-area-inset-bottom\)/s,
    );
    // The docked tab bar: the home-indicator inset, at least size-home-indicator off-device (D-172).
    expect(ui).toMatch(/\.hl-tabbar \{[^}]*max\(env\(safe-area-inset-bottom\), var\(--size-home-indicator\)\)/s);
    expect(ui).toMatch(/\.hl-sheet \{[^}]*env\(safe-area-inset-bottom\)/s);
    // The compact bar clears the notch.
    expect(ui).toMatch(/\.hl-p-bar \{[^}]*env\(safe-area-inset-top\)/s);
  });

  it('on a phone controls get 44 px hit areas, rows 48 px, and fields at least 16 px text', () => {
    const phone = ui.slice(ui.indexOf('Touch (US-PHONE-02)'));
    expect(phone).toMatch(/\.hl-btn-sm \{[^}]*height: var\(--size-control\)/);
    expect(phone).toMatch(/\.hl-switch \{[^}]*height: var\(--size-control\)/);
    // Rows are 48px (size-row, D-172: 44–48px rows), above the 44px target.
    expect(phone).toMatch(/\.hl-list-row \{\s*min-height: var\(--size-row\)/);
    expect(ui).toMatch(/\.hl-p-row \{[^}]*min-height: var\(--size-row\)/s);
    // 17px (the design's row text), at least the 16px iOS needs not to zoom.
    expect(phone).toMatch(/\.hl-input,\s*input,\s*textarea,\s*select \{\s*font-size: 17px/);
    expect(ui).toMatch(/\.hl-tab \{[^}]*min-width: var\(--size-control\)/s);
  });

  it('the keyboard counts as open when a field has focus and the visual viewport shrank', () => {
    const field = document.createElement('input');
    expect(keyboardOpen(500, 844, field)).toBe(true);
    expect(keyboardOpen(800, 844, field)).toBe(false);
    expect(keyboardOpen(500, 844, document.body)).toBe(false);
    const box = document.createElement('input');
    box.type = 'checkbox';
    expect(keyboardOpen(500, 844, box)).toBe(false);
  });

  it('while the keyboard is open the tab bar steps aside and the focused field scrolls into view', () => {
    let height = 844;
    const listeners: Array<() => void> = [];
    const vv = {
      get height() {
        return height;
      },
      addEventListener: (_: string, l: () => void) => listeners.push(l),
      removeEventListener: () => {},
    };
    const win = { visualViewport: vv, innerHeight: 844, document } as unknown as Window;
    const field = document.createElement('input');
    document.body.append(field);
    field.scrollIntoView = vi.fn();
    const stop = watchPhoneViewport(win);
    expect(document.documentElement.style.getPropertyValue('--hl-visual-height')).toBe('844px');
    field.focus();
    height = 500;
    for (const l of listeners) l();
    expect(document.documentElement.getAttribute('data-keyboard')).toBe('open');
    expect(document.documentElement.style.getPropertyValue('--hl-visual-height')).toBe('500px');
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(ui).toMatch(/\[data-keyboard='open'\] \.hl-nav-phone \{\s*display: none/);
    height = 844;
    for (const l of listeners) l();
    expect(document.documentElement.hasAttribute('data-keyboard')).toBe(false);
    stop();
    field.remove();
  });

  it('with no hover, hover-only controls show', () => {
    expect(app).toMatch(/@media \(hover: none\) \{\s*\.hl-hover-reveal \{\s*opacity: 1 !important/);
  });
});
