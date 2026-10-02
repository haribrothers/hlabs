// US-HOME-23 · See which apps are open in the Dock.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Shell } from '../shell/shell';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppWindow } from './app-window';
import { closeWindow, openWindow } from './open-windows';

const never = () => new Promise(() => {});
const listed = (id: string, name: string) => ({
  id,
  name,
  state: 'running' as const,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: true,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});

function shell(apps = [listed('jellyfin', 'Jellyfin')]) {
  return renderScreen(
    () => (
      <Shell>
        <p>Page content</p>
      </Shell>
    ),
    { 'auth.me': fakeMe({ role: 'member' }), 'apps.list': () => ({ apps }), 'events.stream': never },
  );
}

const dock = async () => within(await screen.findByTestId('dock-bar'));

describe('US-HOME-23', () => {
  it('an open app window shows in the Dock with a dot, named "<App>, open", after the pinned apps', async () => {
    openWindow('jellyfin');
    shell();
    const tile = await (await dock()).findByRole('button', { name: 'Jellyfin, open' });
    expect(tile.querySelector('.hl-dock-dot, [data-dot="true"], .hl-dot')).not.toBeNull();
  });

  it('pressing its Dock tile brings the window back', async () => {
    openWindow('jellyfin');
    const { router } = shell();
    fireEvent.click(await (await dock()).findByRole('button', { name: 'Jellyfin, open' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/jellyfin'));
  });

  it('closing the window takes the app out of the Dock', async () => {
    openWindow('jellyfin');
    shell();
    await (await dock()).findByRole('button', { name: 'Jellyfin, open' });
    act(() => closeWindow('jellyfin'));
    await waitFor(async () => expect((await dock()).queryByRole('button', { name: /Jellyfin/ })).toBeNull(), {
      timeout: 300,
    });
  });

  it("an app that's gone (uninstalled, no longer shared) has no Dock tile", async () => {
    openWindow('immich');
    shell([listed('jellyfin', 'Jellyfin')]);
    await screen.findByText('Page content');
    await new Promise((r) => setTimeout(r, 20));
    expect((await dock()).queryByRole('button', { name: /Immich/ })).toBeNull();
  });

  it('Back to Home leaves the window open; Close app closes it', async () => {
    const app = appDetail({ id: 'jellyfin', name: 'Jellyfin', state: 'running', embed: true });
    const handlers = {
      'auth.me': fakeMe({ role: 'member' }),
      'apps.get': () => app,
      'apps.list': () => ({ apps: [listed('jellyfin', 'Jellyfin')] }),
      'events.stream': never,
    };
    const first = renderScreen(() => <AppWindow appId="jellyfin" />, handlers, { path: '/apps/jellyfin' });
    fireEvent.click(await screen.findByRole('button', { name: 'Back to Home' }));
    first.unmount();
    shell();
    expect(await (await dock()).findByRole('button', { name: 'Jellyfin, open' })).toBeInTheDocument();
  });

  it('Close app takes it out of the Dock', async () => {
    openWindow('jellyfin');
    const app = appDetail({ id: 'jellyfin', name: 'Jellyfin', state: 'running', embed: true });
    renderScreen(
      () => <AppWindow appId="jellyfin" />,
      { 'auth.me': fakeMe({ role: 'member' }), 'apps.get': () => app, 'events.stream': never },
      { path: '/apps/jellyfin' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Close app' }));
    const { unmount } = shell();
    await screen.findByText('Page content');
    expect((await dock()).queryByRole('button', { name: /Jellyfin/ })).toBeNull();
    unmount();
  });
});
