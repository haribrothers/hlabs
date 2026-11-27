// US-PHONE-11 · App details on phone: "‹ App Store", the logo, name and tagline, a full-width Install; the chips;
// screenshots sideways, one per 85% of the width, each "Screenshot N", opening full-screen; Version, Runs as
// ("3 containers") and Needs access to; Open once installed.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { details } from '../test/store';
import { AppDetails } from './app-details';

const never = () => new Promise(() => {});
const GIB = 2 ** 30;
function show(
  installed: unknown[] = [],
  d = details({ screenshots: ['/s/1.png', '/s/2.png', '/s/3.png'] }),
  installedVersion = '3.2.2',
) {
  return renderScreen(() => <AppDetails appId="immich" />, {
    'auth.me': fakeMe(),
    'store.getApp': () => d,
    'apps.list': () => ({ apps: installed }),
    'apps.get': () => ({ id: 'immich', version: installedVersion }),
    'events.stream': never,
  });
}
const cells = (strip: HTMLElement) =>
  [...strip.children].map((c) => [...c.children].map((e) => e.textContent).join(' | '));

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('US-PHONE-11', () => {
  it('"‹ App Store", the logo, name, tagline and the primary Install beside the app (PhoneRedesignA_Details)', async () => {
    show();
    expect(await screen.findByRole('button', { name: 'App Store' })).toHaveClass('hl-p-back');
    expect(screen.getByRole('heading', { level: 1, name: 'Immich' })).toBeInTheDocument();
    expect(screen.getByText('Photo and video backup from your phone')).toBeInTheDocument();
    const install = screen.getByRole('button', { name: 'Install' });
    expect(install).toHaveClass('hl-btn-primary');
    // Under the name and tagline, in the app's header.
    expect(install.closest('header')).toContainElement(screen.getByRole('heading', { level: 1, name: 'Immich' }));
  });

  it('the strip under the app: Version, Memory and Disk from the manifest, and the category', async () => {
    show(
      [],
      details({
        requirements: { memoryBytes: 4 * GIB, diskBytes: 10 * GIB, memoryFreeBytes: null, diskFreeBytes: null },
      }),
    );
    const strip = await screen.findByLabelText('At a glance');
    expect(cells(strip)).toEqual([
      'Version | 3.2.2 | Latest',
      'Memory | 4 GB | at least',
      'Disk | 10 GB | to start',
      'Category |  | Photos',
    ]);
    // The category's glyph.
    expect(strip.lastElementChild!.querySelector('svg')).not.toBeNull();
  });

  it('the strip says "—" with no line under it where the manifest gives no figure', async () => {
    show();
    const strip = await screen.findByLabelText('At a glance');
    expect(cells(strip).slice(1, 3)).toEqual(['Memory | —', 'Disk | —']);
  });

  it('installed at another version, the strip says which', async () => {
    const immich = {
      id: 'immich',
      name: 'Immich',
      state: 'running',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed: false,
      ownLogin: false,
      urls: { local: 'https://immich.hlabs.local', tailnet: null, port: null },
    };
    show([immich], details(), '3.2.1');
    const strip = await screen.findByLabelText('At a glance');
    await waitFor(() => expect(cells(strip)[0]).toBe('Version | 3.2.2 | Installed 3.2.1'));
  });

  it('the chips: the category, Apple Silicon and hlabs official', async () => {
    show();
    await screen.findByRole('heading', { level: 1, name: 'Immich' });
    for (const chip of ['Files & photos', 'Apple Silicon', 'hlabs official'])
      expect(screen.getByText(chip)).toBeInTheDocument();
  });

  it('screenshots scroll sideways with snap, 85% each, "Screenshot N"; one opens full-screen', async () => {
    show();
    const shots = await screen.findByRole('region', { name: 'Screenshots' });
    const list = within(shots).getByRole('list');
    expect(list).toHaveClass('snap-x', 'snap-mandatory', 'overflow-x-auto');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) expect(item).toHaveClass('w-[85%]');
    expect(within(shots).getByAltText('Screenshot 1')).toBeInTheDocument();
    expect(within(shots).getByAltText('Screenshot 3')).toBeInTheDocument();
    fireEvent.click(within(shots).getByRole('button', { name: 'Screenshot 2' }));
    expect(await screen.findByRole('dialog', { name: 'Screenshot 2 of 3' })).toBeInTheDocument();
  });

  it('the facts: Version, Runs as "3 containers" and Needs access to', async () => {
    show();
    const list = await screen.findByLabelText('About this app');
    expect(list).toHaveTextContent('Version3.2.2');
    expect(list).toHaveTextContent('Runs as3 containers');
    expect(list).not.toHaveTextContent('server, database');
    expect(list).toHaveTextContent('Needs access toYour Photos folder');
  });

  it('once installed the button is Open, and opens the app', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    show([
      {
        id: 'immich',
        name: 'Immich',
        state: 'running',
        icon: { logoUrl: null, gradient: null, fallback: null },
        embed: false,
        ownLogin: false,
        urls: { local: 'https://immich.hlabs.local', tailnet: null, port: null },
      },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith('https://immich.hlabs.local');
  });
});
