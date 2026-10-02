import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { HomeView } from './home-view';

const app = (id: string, name: string) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});
const SHARED = [
  app('jellyfin', 'Jellyfin'),
  app('immich', 'Immich'),
  app('nextcloud', 'Nextcloud'),
  app('ha', 'Home Assistant'),
];

function memberHome(canInstallApps: boolean) {
  return renderScreen(HomeView, {
    'auth.me': fakeMe({ role: 'member', displayName: 'Anu', canInstallApps, canSeeUsage: false }),
    'home.getLayout': () => ({ items: [], dock: [] }),
    'apps.list': () => ({ apps: SHARED }),
    'events.stream': () => new Promise(() => {}),
  });
}

describe('US-HOME-11', () => {
  it('greets me by name and shows exactly the 4 apps shared with me, with no "Install app" tile', async () => {
    memberHome(false);
    expect(await screen.findByRole('heading', { level: 1, name: /, Anu$/ })).toBeInTheDocument();
    const grid = await screen.findByRole('list', { name: 'Apps' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4);
    expect(within(grid).queryByText('Install app')).toBeNull();
  });

  it('shows "Install app" when members may install apps', async () => {
    memberHome(true);
    const grid = await screen.findByRole('list', { name: 'Apps' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(5);
    expect(within(grid).getByText('Install app')).toBeInTheDocument();
  });
});
