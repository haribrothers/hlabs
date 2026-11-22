// US-STORE-05 · Search results with filters: "Results for “q”", the daemon's counts on the chips, "Installed" and
// "Apple Silicon only" asked of the daemon, "No apps match “q”", and for admins "Can't find an app? Add another app
// source" with or without results; one character asks for nothing.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { storeApp } from '../test/store';
import { SearchResults } from './search-results';

function search(query: string, opts: { role?: 'admin' | 'member'; empty?: boolean } = {}) {
  return renderScreen(
    () => <SearchResults query={query} shippedPhase={7} />,
    {
      'store.listApps': (input) => {
        const { installedOnly } = input as { installedOnly?: boolean };
        const items = opts.empty
          ? []
          : [storeApp('immich', 'Immich', { installed: true }), storeApp('piwigo', 'Piwigo')].filter(
              (a) => !installedOnly || a.installed,
            );
        return {
          host: { os: 'macos', arm64: true },
          title: null,
          counts: opts.empty ? { all: 0, installed: 0 } : { all: 5, installed: 1 },
          items,
          nextCursor: null,
        };
      },
      'apps.list': () => ({ apps: [] }),
      'events.stream': () => new Promise(() => {}),
      'auth.me': fakeMe({ role: opts.role ?? 'admin' }),
    },
    { path: '/store/search' },
  );
}

describe('US-STORE-05', () => {
  it('the chips carry the daemon’s counts; "Installed" asks it for installed apps only', async () => {
    const { calls } = search('photo');
    expect(await screen.findByRole('button', { name: 'All · 5' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installed · 1' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'store.listApps').at(-1)?.input).toMatchObject({
        query: 'photo',
        installedOnly: true,
        arm64Only: false,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apple Silicon only' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'store.listApps').at(-1)?.input).toMatchObject({ arm64Only: true }),
    );
  });

  it('no results: "No apps match “q”" and, for admins, the way to add an app source', async () => {
    search('zzz', { empty: true });
    expect(await screen.findByText('No apps match “zzz”')).toBeInTheDocument();
    expect(screen.getByText(/Can’t find an app\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add another app source' })).toHaveAttribute('href', '/store/sources');
  });

  it('with results an admin still finds "Can’t find an app?" below the list', async () => {
    search('photo');
    await screen.findByRole('list', { name: 'Results for “photo”' });
    expect(screen.getByRole('link', { name: 'Add another app source' })).toBeInTheDocument();
  });

  it('members never get "Add another app source"', async () => {
    search('zzz', { role: 'member', empty: true });
    await screen.findByText('No apps match “zzz”');
    expect(screen.queryByRole('link', { name: 'Add another app source' })).toBeNull();
  });

  it('one character shows nothing and asks for nothing', async () => {
    const { calls } = search('p');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.path === 'store.listApps')).toEqual([]);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
