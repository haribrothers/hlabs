// US-ACCT-35 · Reduce transparency and motion: <html data-theme="solid"> with no backdrop blur anywhere, and
// <html data-motion="reduced"> with Framer Motion's transitions instant; the device's setting starts Reduce motion
// until the person changes it; both apply at once and are saved. Framer Motion's side: packages/ui/test/us-acct-35.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPEARANCE_CACHE_KEY } from '../lib/appearance';
import { renderAppearance, resetRoot } from '../test/appearance';

const root = () => document.documentElement;

/** The device says "reduce motion" (or not), as matchMedia reports it. */
function osReducesMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => {
  resetRoot();
  osReducesMotion(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('US-ACCT-35', () => {
  it('the two switches with their notes, off by default', async () => {
    renderAppearance();
    const transparency = await screen.findByRole('switch', { name: 'Reduce transparency' });
    const motion = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(transparency).not.toBeChecked();
    expect(motion).not.toBeChecked();
    expect(screen.getByText('Solid backgrounds instead of glass, easier to read')).toBeInTheDocument();
    expect(screen.getByText('Turns off icon bounce and window animations')).toBeInTheDocument();
    await waitFor(() => expect(root().dataset.theme).toBe('glass'));
    expect(root().dataset.motion).toBe('full');
  });

  it('Reduce transparency sets data-theme="solid" at once and is saved', async () => {
    const { update } = renderAppearance();
    fireEvent.click(await screen.findByRole('switch', { name: 'Reduce transparency' }));
    await waitFor(() => expect(root().dataset.theme).toBe('solid'));
    expect(update).toHaveBeenCalledWith({ reduceTransparency: true });
    expect(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY)!)).toMatchObject({ solid: true });
  });

  it('Reduce motion sets data-motion="reduced" at once and is saved', async () => {
    const { update } = renderAppearance();
    fireEvent.click(await screen.findByRole('switch', { name: 'Reduce motion' }));
    await waitFor(() => expect(root().dataset.motion).toBe('reduced'));
    expect(update).toHaveBeenCalledWith({ reduceMotion: true });
    expect(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY)!)).toMatchObject({ motion: 'reduced' });
  });

  it("never set: the device's reduce-motion starts it on; once changed, the choice wins", async () => {
    osReducesMotion(true);
    const { update } = renderAppearance({ reduceMotion: null });
    const motion = await screen.findByRole('switch', { name: 'Reduce motion' });
    expect(motion).toBeChecked();
    await waitFor(() => expect(root().dataset.motion).toBe('reduced'));
    // Not a choice yet, so the next load follows the device too.
    expect(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY)!)).toMatchObject({ motion: null });
    fireEvent.click(motion);
    await waitFor(() => expect(root().dataset.motion).toBe('full'));
    expect(motion).not.toBeChecked();
    expect(update).toHaveBeenCalledWith({ reduceMotion: false });
    expect(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY)!)).toMatchObject({ motion: 'full' });
  });

  it('a saved choice wins over the device either way', async () => {
    osReducesMotion(true);
    renderAppearance({ reduceMotion: false });
    expect(await screen.findByRole('switch', { name: 'Reduce motion' })).not.toBeChecked();
    await waitFor(() => expect(root().dataset.motion).toBe('full'));
  });

  it('the CSS: no backdrop blur at all in the solid theme, and every motion rule keyed by data-motion', () => {
    const css = readFileSync('../../packages/ui/src/styles/components.css', 'utf8');
    expect(css).toMatch(
      /\[data-theme='solid'\] \*,\s*\[data-theme='solid'\] \*::before,\s*\[data-theme='solid'\] \*::after \{[^}]*backdrop-filter: none !important;/,
    );
    expect(css).not.toContain('data-reduce-motion');
    // Every system-setting rule steps aside when the person chose full motion.
    const osRules = css.split('@media (prefers-reduced-motion: reduce)').slice(1);
    expect(osRules.length).toBeGreaterThan(0);
    for (const rule of osRules) expect(rule.slice(0, rule.indexOf('}'))).toContain(":root:not([data-motion='full'])");
    expect(css).toMatch(/\[data-motion='reduced'\] \{\s*--hl-dur-fast: 0ms;/);
  });

  it("the first script sets the solid theme and the person's motion before the first paint", () => {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: 'violet', solid: true, motion: 'reduced' }));
    const html = readFileSync('index.html', 'utf8');
    new Function(/<script>([\s\S]*?)<\/script>/.exec(html)![1]!)();
    expect(root().dataset.theme).toBe('solid');
    expect(root().dataset.motion).toBe('reduced');
  });
});
