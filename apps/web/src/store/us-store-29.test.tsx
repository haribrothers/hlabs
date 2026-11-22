// US-STORE-28 (an app's page: its source, signed or "Not signed") and US-STORE-29 · Copy a built-in app into my library:
// "…" › Copy to my library… picks a library and a name (<id>-custom), copies into a folder library and opens the copy,
// or downloads a zip for a git library; a name that's taken says so.
import type { AppSource, StoreAppDetails } from '@hlabs/api';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { details } from '../test/store';
import { AppDetails } from './app-details';

const lib = (extra: Partial<AppSource>): AppSource => ({
  id: 'my-apps',
  name: 'My apps',
  url: '/Users/hari/hlabs/users/hari/my-apps',
  kind: 'local',
  appCount: 2,
  lastSyncedAt: 1,
  lastError: null,
  enabled: true,
  signed: false,
  keyFingerprint: null,
  problems: [],
  removable: true,
  filesPath: null,
  ...extra,
});
const BUILTIN = lib({
  id: 'builtin',
  name: 'hlabs official',
  kind: 'builtin',
  url: '',
  removable: false,
  signed: true,
});
const FAMILY = lib({
  id: 'family',
  name: 'Family apps',
  url: 'https://github.com/you/family-apps',
  kind: 'git',
  signed: true,
});

function show(
  d: StoreAppDetails = details({ website: 'https://immich.app' }),
  handlers: Record<string, (input: unknown) => unknown> = {},
  role: 'admin' | 'member' = 'admin',
) {
  return renderScreen(
    () => <AppDetails appId="immich" shippedPhase={7} />,
    {
      'auth.me': fakeMe({ role }),
      'store.getApp': () => d,
      'apps.list': () => ({ apps: [] }),
      'events.stream': () => new Promise(() => {}),
      'store.sources.list': () => ({ sources: [BUILTIN, lib({}), FAMILY] }),
      ...handlers,
    },
    { routes: { '/store/app/$appId': () => <h1>Copy page</h1> } },
  );
}

async function openCopy() {
  fireEvent.keyDown(await screen.findByRole('button', { name: 'More' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy to my library…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Copy Immich to your library' });
  await within(dialog).findAllByRole('radio');
  return dialog;
}

describe("US-STORE-28 · an app's source", () => {
  it('the built-in store: "hlabs official · signed"', async () => {
    show();
    expect(await screen.findByText('hlabs official · signed')).toBeInTheDocument();
    expect(screen.queryByText('Not signed')).toBeNull();
  });

  it('an unsigned library: "From My apps", "Not signed"', async () => {
    show(details({ source: { id: 'my-apps', name: 'My apps', official: false, signed: false, kind: 'local' } }));
    expect(await screen.findByText('From My apps')).toBeInTheDocument();
    expect(screen.getByText('Not signed')).toBeInTheDocument();
    expect(screen.getByText('My apps · not signed')).toBeInTheDocument();
  });
});

describe('US-STORE-29', () => {
  it('"…" has Copy to my library… for admins and the app\'s website', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    show();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'More' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: "Open the app's website" }));
    expect(open).toHaveBeenCalledWith('https://immich.app');
    open.mockRestore();
  });

  it('members get no Copy to my library', async () => {
    show(undefined, {}, 'member');
    fireEvent.keyDown(await screen.findByRole('button', { name: 'More' }), { key: 'Enter' });
    await screen.findByRole('menuitem', { name: "Open the app's website" });
    expect(screen.queryByRole('menuitem', { name: 'Copy to my library…' })).toBeNull();
  });

  it('into a folder library: the libraries, "<id>-custom", the note; Copy copies and opens the copy', async () => {
    const { calls, router } = show(undefined, {
      'store.copyToLibrary': () => ({ kind: 'folder', appId: 'immich-custom', path: '/x' }),
    });
    const dialog = await openCopy();
    const choices = within(dialog).getAllByRole('radio');
    expect(choices).toHaveLength(2);
    expect(choices[0]).toBeChecked();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('immich-custom');
    expect(dialog).toHaveTextContent('Copies its manifest, compose file and logo to apps/immich-custom/ in My apps');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'store.copyToLibrary')?.input).toEqual({
        appId: 'immich',
        sourceId: 'builtin',
        libraryId: 'my-apps',
        newId: 'immich-custom',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/store/app/immich-custom'));
  });

  it('into a git library: the button is Download, and the zip downloads', async () => {
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {});
    show(undefined, { 'store.copyToLibrary': () => ({ kind: 'zip', url: '/api/store/copy/t.zip' }) });
    const dialog = await openCopy();
    fireEvent.click(within(dialog).getAllByRole('radio')[1]!);
    expect(dialog).toHaveTextContent('Downloads its manifest, compose file and logo as a zip');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/store/copy/t.zip'));
    assign.mockRestore();
  });

  it('a name that\'s taken: "My apps already has an app called immich-custom"', async () => {
    show(undefined, {
      'store.copyToLibrary': () => {
        throw daemonError('LIBRARY_APP_EXISTS', { id: 'immich-custom', library: 'My apps' });
      },
    });
    const dialog = await openCopy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(await within(dialog).findByText('My apps already has an app called immich-custom')).toBeInTheDocument();
  });
});
