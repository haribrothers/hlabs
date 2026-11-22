// US-HOME-17 · Rearrange apps and widgets: Space picks a tile up, arrow keys move it, Space drops it, Escape cancels it,
// each step announced; widgets and apps are separate lists; "Install app" is hidden while editing. Mouse and touch drags
// are checked in e2e (us-home-17.spec.ts).
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeAt7 } from '../test/home-edit';

/** jsdom lays nothing out: give each sortable a 100 px slot in its row, so the arrow keys have somewhere to go. */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const li = this.closest('li');
    const list = li?.parentElement;
    const i = li && list ? [...list.children].indexOf(li) : 0;
    return {
      x: i * 100,
      y: 0,
      left: i * 100,
      top: 0,
      right: i * 100 + 80,
      bottom: 80,
      width: 80,
      height: 80,
      toJSON() {},
    } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
});

async function edit() {
  const r = homeAt7({}, { widgets: ['storage', 'live-usage'] });
  const t = await screen.findByRole('button', { name: 'Open Jellyfin' });
  fireEvent.contextMenu(t.closest('li')!.firstElementChild!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Home' }));
  await screen.findByRole('heading', { level: 1, name: 'Drag to rearrange' });
  return r;
}

const order = (label: string) =>
  [...screen.getByRole('list', { name: label }).querySelectorAll(':scope > li [aria-roledescription]')].map((el) =>
    el.getAttribute('aria-label'),
  );
/** The draggable handle (jsdom ignores `inert`, so the tile inside it is a button too). */
const handle = (name: string) => document.querySelector<HTMLElement>(`[aria-roledescription][aria-label="${name}"]`)!;
const key = async (el: Element, k: string) => {
  await act(async () => {
    fireEvent.keyDown(el, { key: k, code: k === ' ' ? 'Space' : k });
    await new Promise((r) => setTimeout(r, 30));
  });
};

describe('US-HOME-17', () => {
  it('Space picks a tile up, the arrows move it, Space drops it; every step is announced', async () => {
    const { saved } = await edit();
    expect(order('Apps')).toEqual(['Jellyfin', 'Immich', 'Vaultwarden']);
    const jelly = handle('Jellyfin');
    jelly.focus();
    await key(jelly, ' ');
    await waitFor(() => expect(document.body).toHaveTextContent('Jellyfin, position 1 of 3'));
    await key(jelly, 'ArrowRight');
    await waitFor(() => expect(document.body).toHaveTextContent('Jellyfin, position 2 of 3'));
    await key(jelly, ' ');
    await waitFor(() => expect(order('Apps')).toEqual(['Immich', 'Jellyfin', 'Vaultwarden']));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.items.filter((i) => i.kind === 'app').map((i) => i.id)).toEqual(['immich', 'jellyfin', 'vault']);
  });

  it('Escape cancels the move without leaving edit mode', async () => {
    await edit();
    const jelly = handle('Jellyfin');
    jelly.focus();
    await key(jelly, ' ');
    await key(jelly, 'ArrowRight');
    await key(jelly, 'Escape');
    await waitFor(() => expect(document.body).toHaveTextContent('Moving Jellyfin cancelled'));
    expect(order('Apps')).toEqual(['Jellyfin', 'Immich', 'Vaultwarden']);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeInTheDocument();
  });

  it('widgets move only within their row, apps within the grid', async () => {
    await edit();
    expect(order('Widgets')).toEqual(['Storage', 'Live usage']);
    const storage = handle('Storage');
    storage.focus();
    await key(storage, ' ');
    await key(storage, 'ArrowRight');
    await key(storage, ' ');
    await waitFor(() => expect(order('Widgets')).toEqual(['Live usage', 'Storage']));
    // Apps are another list: a widget never lands among them.
    expect(order('Apps')).toEqual(['Jellyfin', 'Immich', 'Vaultwarden']);
    expect(screen.queryByRole('link', { name: 'Install app' })).toBeNull();
  });
});
