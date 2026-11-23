// US-ACCT-33 · Choose an accent colour: Violet, Mint, Amber and Rose as a radio group; a pick sets
// <html data-accent> at once and is saved; arrow keys move the choice; the next load sets it before the first paint
// from the copy kept on this device.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { APPEARANCE_CACHE_KEY } from '../lib/appearance';
import { renderAppearance, resetRoot } from '../test/appearance';

beforeEach(resetRoot);

const swatches = async () => screen.findByRole('radiogroup', { name: 'Accent colour' });
const root = () => document.documentElement;

/** index.html's first script, run as the browser would before anything else on the page. */
function runBootScript() {
  const html = readFileSync('index.html', 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  expect(script).toBeTruthy();
  new Function(script!)();
}

describe('US-ACCT-33', () => {
  it('four swatches with names, as a radio group; the current one is checked', async () => {
    renderAppearance({ accent: 'amber' });
    const radios = within(await swatches()).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Violet', 'Mint', 'Amber', 'Rose']);
    expect(within(await swatches()).getByRole('radio', { name: 'Amber' })).toHaveAttribute('aria-checked', 'true');
    // Only the checked one is in the tab order.
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('a pick changes data-accent at once and is saved for the account', async () => {
    const { update } = renderAppearance();
    await waitFor(() => expect(root().dataset.accent).toBe('violet'));
    fireEvent.click(within(await swatches()).getByRole('radio', { name: 'Rose' }));
    await waitFor(() => expect(root().dataset.accent).toBe('rose'));
    expect(update).toHaveBeenCalledWith({ accent: 'rose' });
    expect(within(await swatches()).getByRole('radio', { name: 'Rose' })).toHaveAttribute('aria-checked', 'true');
  });

  it('arrow keys move the choice between swatches, wrapping round', async () => {
    const { update } = renderAppearance();
    const violet = within(await swatches()).getByRole('radio', { name: 'Violet' });
    violet.focus();
    fireEvent.keyDown(violet, { key: 'ArrowRight' });
    await waitFor(() => expect(root().dataset.accent).toBe('mint'));
    expect(within(await swatches()).getByRole('radio', { name: 'Mint' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    await waitFor(() => expect(root().dataset.accent).toBe('rose'));
    expect(within(await swatches()).getByRole('radio', { name: 'Rose' })).toHaveFocus();
    expect(update.mock.calls.map(([c]) => c)).toEqual([{ accent: 'mint' }, { accent: 'violet' }, { accent: 'rose' }]);
  });

  it('is kept on this device, and the next load sets it before the first paint', async () => {
    renderAppearance({ accent: 'mint' });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY)!)).toMatchObject({ accent: 'mint' }),
    );
    resetRoot();
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: 'amber', solid: false, motion: null }));
    runBootScript();
    expect(root().dataset.accent).toBe('amber');
    expect(root().dataset.motion).toBeUndefined();
  });

  it("the first script ignores what isn't an accent, and a broken cache", () => {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ accent: 'sky' }));
    runBootScript();
    expect(root().dataset.accent).toBeUndefined();
    localStorage.setItem(APPEARANCE_CACHE_KEY, '{not json');
    expect(runBootScript).not.toThrow();
  });
});
