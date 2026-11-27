// US-TAB-05 · iPad in portrait (768–1023px by touch): Settings' sidebar becomes the list of sections in the window
// (TabletSettingsPortrait) with the values at the right; a section fills the window with "‹ Settings" back to the list
// (TabletSettingsPortraitPage); Files' places become a list too. In landscape the sidebar stays.
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilesPlacesList } from '../files/sidebar';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { tabletViewport } from '../test/tablet';
import { updatesData } from '../test/updates';
import { SectionPage } from './section-page';
import { SettingsLayout } from './settings-layout';

const never = () => new Promise(() => {});
const handlers = {
  'auth.me': fakeMe(),
  'users.list': () => ({ users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }] }),
  'backups.overview': () => ({ lastRun: null, destinations: [] }),
  'storage.summary': () => ({ totalBytes: 256e9, freeBytes: 142e9 }),
  'storage.locations.list': () => ({ locations: [] }),
  'store.listUpdates': () => updatesData(),
  'events.stream': never,
};

let restore: () => void = () => {};
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('US-TAB-05', () => {
  it('upright, Settings is the list of sections in the window, with what is in them at the right', async () => {
    restore = tabletViewport(820);
    renderScreen(SettingsLayout, handlers, { path: '/settings' });
    const list = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    const row = (name: string) => within(list).getByRole('link', { name: new RegExp(`^${name}`) });
    expect(row('Account')).toHaveTextContent(/Account.*·.*Admin/);
    await waitFor(() => expect(row('Users')).toHaveTextContent('Users3'));
    expect(row('Engine')).toHaveAttribute('href', '/settings/engine');
    expect(row('Engine')).toHaveClass('hl-t-row');
    // In groups, as drawn: about you, then about the computer.
    expect(list.querySelectorAll('.hl-t-list').length).toBeGreaterThanOrEqual(2);
  });

  it('in landscape the sidebar stays beside the section', async () => {
    restore = tabletViewport(1180);
    renderScreen(SettingsLayout, handlers, { path: '/settings' });
    const list = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(list.querySelector('.hl-t-row')).toBeNull();
  });

  it('a section upright: "‹ Settings" above its title goes back to the list', async () => {
    restore = tabletViewport(820);
    const { router } = renderScreen(() => <SectionPage id="about" shippedPhase={9} />, handlers, {
      path: '/settings/about',
      routes: { '/settings': () => <p>The list</p> },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'About' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });

  it("Files' places upright: a list you go into, grouped as the sidebar", async () => {
    restore = tabletViewport(820);
    renderScreen(() => <FilesPlacesList me={{ role: 'admin', canSeeShared: true }} onConnect={() => {}} />, handlers);
    const places = await screen.findByRole('navigation', { name: 'Places' });
    expect(within(places).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/files?path=%2Fhome');
    expect(within(places).getByRole('link', { name: 'Recents' })).toHaveAttribute('href', '/files?view=recents');
    expect(within(places).getByRole('region', { name: 'Locations' })).toBeInTheDocument();
    expect(within(places).getByRole('button', { name: 'Connect a drive' })).toBeInTheDocument();
  });
});
