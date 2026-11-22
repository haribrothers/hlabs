// US-STORE-18 · See and manage app sources and US-STORE-19 · Add a source with a pinned signing key (dashboard), with
// the library rows of US-STORE-27 and 28: the intro; each source's name, address, app count and last check; the
// built-in one "Can't be removed"; Check now; Open folder; Remove after a confirmation; a failed sync in words; a
// library's broken apps with file and line; Signed or Not signed; Add → "Trust this source?" with the fingerprint, or
// the unsigned warning; "No hlabs apps found at this address" under the field.
import type { AppSource } from '@hlabs/api';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { shortAddress, StoreSourcesView } from './sources-view';

const HOUR = 3_600_000;
const source = (extra: Partial<AppSource>): AppSource => ({
  id: 'x',
  name: 'X',
  url: '',
  kind: 'git',
  appCount: 0,
  lastSyncedAt: Date.now() - 2 * HOUR - 60_000,
  lastError: null,
  enabled: true,
  signed: false,
  keyFingerprint: null,
  problems: [],
  removable: true,
  filesPath: null,
  ...extra,
});
const BUILTIN = source({
  id: 'builtin',
  name: 'hlabs official',
  kind: 'builtin',
  appCount: 100,
  signed: true,
  removable: false,
});
const FAMILY = source({
  id: 'family',
  name: 'Family apps',
  url: 'https://github.com/you/family-apps',
  appCount: 12,
  signed: true,
  keyFingerprint: 'B70D 7998 32CB 6AD2',
  lastSyncedAt: Date.now() - HOUR - 60_000,
});
const MINE = source({
  id: 'my-apps',
  name: 'My apps',
  url: '/Users/hari/hlabs/users/hari/my-apps',
  kind: 'local',
  appCount: 3,
  lastSyncedAt: Date.now() - 5 * 60_000 - 1_000,
  filesPath: '/users/hari/my-apps',
  problems: [
    { appId: 'wiki', file: 'apps/wiki/docker-compose.yml', line: 12, message: "Host networking isn't allowed." },
  ],
});

function page(handlers: Record<string, (input: unknown) => unknown> = {}, sources = [BUILTIN, FAMILY, MINE]) {
  return renderScreen(
    () => <StoreSourcesView />,
    {
      'auth.me': fakeMe(),
      'store.sources.list': () => ({ sources }),
      ...handlers,
    },
    { path: '/store/sources', routes: { '/files': () => <h1>Files page</h1> } },
  );
}

const row = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li')!;

describe('US-STORE-18', () => {
  it("the intro, and each source: name, where, apps, last check; the built-in one can't be removed", async () => {
    page();
    expect(
      await screen.findByText(/A source is a git repository or a folder of app manifests\. hlabs checks each one/),
    ).toBeInTheDocument();
    await screen.findByText('hlabs official', { selector: 'span' });
    const builtin = row('hlabs official');
    expect(builtin).toHaveTextContent('Built in · 100 apps · checked 2 hours ago');
    expect(within(builtin).getByText("Can't be removed")).toBeInTheDocument();
    expect(within(builtin).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(row('Family apps')).toHaveTextContent('github.com/you/family-apps · 12 apps · checked 1 hour ago');
    expect(row('Family apps')).toHaveTextContent('Key B70D 7998 32CB 6AD2');
    expect(within(row('Family apps')).getByText('Signed')).toBeInTheDocument();
    expect(within(row('My apps')).getByText('Not signed')).toBeInTheDocument();
  });

  it('a long folder path keeps its first and last folders; a git address drops https://', () => {
    expect(shortAddress({ kind: 'local', url: '/Volumes/Data/hlabs/users/hari/my-apps' })).toBe(
      '/Volumes/…/hari/my-apps',
    );
    expect(shortAddress({ kind: 'local', url: '~/hlabs/users/hari/my-apps' })).toBe('~/hlabs/users/hari/my-apps');
    expect(shortAddress({ kind: 'git', url: 'https://github.com/you/apps' })).toBe('github.com/you/apps');
  });

  it('Check now syncs the source; a failure says why in words', async () => {
    let failed = false;
    const { calls } = page({
      'store.sources.sync': () => {
        failed = true;
        return { sources: [] };
      },
      'store.sources.list': () => ({
        sources: [BUILTIN, failed ? { ...FAMILY, lastError: 'SOURCE_UNREACHABLE' } : FAMILY],
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Check Family apps now' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'store.sources.sync')?.input).toEqual({ sourceId: 'family' }),
    );
    expect(await within(row('Family apps')).findByRole('alert')).toHaveTextContent("Couldn't reach the repository");
  });

  it('a folder library offers Open folder (in Files) instead of Check now', async () => {
    const { router } = page();
    const mine = await waitFor(() => row('My apps'));
    expect(within(mine).queryByRole('button', { name: /Check/ })).toBeNull();
    fireEvent.click(within(mine).getByRole('button', { name: 'Open folder' }));
    await waitFor(() => expect(router.state.location.href).toBe('/files?path=%2Fusers%2Fhari%2Fmy-apps'));
  });

  it('a library\'s broken app: "1 app has a problem", the file and line, and that the rest still sync', async () => {
    page();
    const mine = await waitFor(() => row('My apps'));
    expect(mine).toHaveTextContent('1 app has a problem');
    expect(mine).toHaveTextContent("apps/wiki/docker-compose.yml:12 Host networking isn't allowed.");
    expect(mine).toHaveTextContent("wiki is left out until it's fixed. The other apps still sync.");
  });

  it('Remove asks first, then removes; apps installed from it keep working', async () => {
    const { calls } = page({ 'store.sources.remove': () => ({ ok: true }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Family apps' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Family apps?' });
    expect(dialog).toHaveTextContent(
      "Apps you installed from it stay installed and keep working, but they won't get updates.",
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'store.sources.remove')?.input).toEqual({ sourceId: 'family' }),
    );
  });
});

describe('US-STORE-19', () => {
  const add = async (url: string) => {
    fireEvent.change(await screen.findByPlaceholderText('https://github.com/you/your-app-store'), {
      target: { value: url },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  };

  it('the field, its placeholder and the note about trust', async () => {
    page();
    expect(await screen.findByPlaceholderText('https://github.com/you/your-app-store')).toBeInTheDocument();
    expect(
      screen.getAllByText(/Only add sources you trust\. Apps from any source still ask for your approval/).length,
    ).toBeGreaterThan(0);
  });

  it('Add inspects first: "Trust this source?" with its name, app count and fingerprint; Add source pins it', async () => {
    const { calls } = page({
      'store.sources.inspect': () => ({
        kind: 'git',
        url: 'https://github.com/you/more',
        name: 'More apps',
        appCount: 7,
        signed: true,
        keyFingerprint: 'AAAA BBBB CCCC DDDD',
      }),
      'store.sources.add': () => ({ sourceId: 'more-apps' }),
    });
    await add('https://github.com/you/more');
    const dialog = await screen.findByRole('dialog', { name: 'Trust this source?' });
    expect(dialog).toHaveTextContent('More apps');
    expect(dialog).toHaveTextContent('7 apps');
    expect(dialog).toHaveTextContent('AAAA BBBB CCCC DDDD');
    expect(calls.some((c) => c.path === 'store.sources.add')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add source' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'store.sources.add')?.input).toEqual({
        url: 'https://github.com/you/more',
        keyFingerprint: 'AAAA BBBB CCCC DDDD',
      }),
    );
  });

  it('an unsigned source warns and still allows adding', async () => {
    page({
      'store.sources.inspect': () => ({
        kind: 'index',
        url: 'https://x.example/lib',
        name: 'X lib',
        appCount: 2,
        signed: false,
        keyFingerprint: null,
      }),
    });
    await add('https://x.example/lib');
    const dialog = await screen.findByRole('dialog', { name: 'Trust this source?' });
    expect(dialog).toHaveTextContent("This source isn't signed. Updates can't be verified.");
    expect(within(dialog).getByRole('button', { name: 'Add source' })).toBeEnabled();
  });

  it('nothing there: "No hlabs apps found at this address" under the field, nothing saved', async () => {
    const { calls } = page({
      'store.sources.inspect': () => {
        throw daemonError('SOURCE_EMPTY');
      },
    });
    await add('https://example.com/nothing');
    expect(await screen.findByText('No hlabs apps found at this address')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((c) => c.path === 'store.sources.add')).toBe(false);
  });

  it('opened from "Add another app source", the field has focus', async () => {
    renderScreen(() => <StoreSourcesView focusAdd />, {
      'auth.me': fakeMe(),
      'store.sources.list': () => ({ sources: [BUILTIN] }),
    });
    await waitFor(() => expect(screen.getByPlaceholderText('https://github.com/you/your-app-store')).toHaveFocus());
  });
});
