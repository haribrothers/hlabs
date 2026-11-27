// US-HOME-15 · See a friendly empty Home: the welcome, "No apps yet" and the way to the App Store for an admin; the
// widgets and the Install tile still there; the grid back as soon as the first app starts installing; and whom a
// member should ask.
import type { HomeApp } from './app-grid';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeAccount } from '../test/account';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { HomeView } from './home-view';

const app = (id: string, name: string, state: HomeApp['state']): HomeApp => ({
  id,
  name,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

function home(handlers: Handlers) {
  return renderScreen(
    () => <HomeView />,
    {
      'auth.me': fakeMe({ role: 'admin' }),
      'home.getLayout': () => ({ items: [{ kind: 'widget', id: 'storage' }], dock: [] }),
      'home.getWidgetData': () => ({}),
      'apps.list': () => ({ apps: [] }),
      'events.stream': () => new Promise(() => {}),
      ...handlers,
    },
    { routes: { '/store': () => <h1>App Store</h1> } },
  );
}

describe('US-HOME-15', () => {
  it('an admin with no apps: the welcome, "No apps yet", what most people start with and the App Store', async () => {
    home({});
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to hlabs, Hari' })).toBeInTheDocument();
    const empty = await screen.findByRole('region', { name: 'No apps yet' });
    expect(empty).toHaveTextContent(
      "Your apps appear here once they're installed. Most people start with a photo library, a media server and a password manager.",
    );
    const browse = within(empty).getByRole('link', { name: 'Browse the App Store' });
    expect(browse).toHaveClass('hl-btn-primary');
    fireEvent.click(browse);
    expect(await screen.findByRole('heading', { name: 'App Store' })).toBeInTheDocument();
  });

  it('the widgets and the "Install app" tile are still there', async () => {
    home({});
    const empty = await screen.findByRole('region', { name: 'No apps yet' });
    expect(within(empty).getByRole('link', { name: 'Install app' })).toHaveAttribute('href', '/store');
    expect(screen.getByRole('region', { name: 'Widgets' })).toBeInTheDocument();
  });

  it('the first app starting to install brings the grid back, and the usual greeting', async () => {
    let apps: HomeApp[] = [];
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    home({ 'apps.list': () => ({ apps }), 'events.stream': () => event });
    await screen.findByRole('region', { name: 'No apps yet' });
    apps = [app('immich', 'Immich', 'installing')];
    await act(async () =>
      publish({
        id: '1',
        data: { type: 'app.stateChanged', data: { appId: 'immich', state: 'installing', detail: null } },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('region', { name: 'No apps yet' })).toBeNull());
    expect(screen.getByRole('button', { name: /Immich, installing/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Hari$/);
  });

  it('a member with nothing shared: whom to ask, and no button', async () => {
    home({
      'auth.me': fakeMe({ role: 'member', canInstallApps: false }),
      'account.get': fakeAccount({ adminName: 'Hari' }),
    });
    const empty = await screen.findByRole('region', { name: 'No apps yet' });
    await waitFor(() => expect(empty).toHaveTextContent('Ask Hari to share an app with you.'));
    expect(within(empty).queryByRole('link')).toBeNull();
    expect(within(empty).queryByRole('button')).toBeNull();
  });

  it('an app only taken off Home still counts: no empty state while apps are installed', async () => {
    home({
      'home.getLayout': () => ({ items: [], dock: [] }),
      'apps.list': () => ({ apps: [app('vault', 'Vaultwarden', 'running')] }),
    });
    await screen.findByRole('button', { name: 'Open Vaultwarden' });
    expect(screen.queryByRole('region', { name: 'No apps yet' })).toBeNull();
  });
});
