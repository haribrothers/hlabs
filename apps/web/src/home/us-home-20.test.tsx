// US-HOME-20 · Show app widgets with live data: the figures, a refresh every minute, "<App> isn't running", "Couldn't
// load" with the last good figures greyed, asking an admin for the key, opening the app; and adding the key in App
// settings (D-157).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppWidgetKey } from '../apps/app-widget-key';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { tile } from '../test/home-edit';
import { AppWidget } from './more-widgets';

afterEach(() => vi.useRealTimers());

const ID = 'app:immich:library';
const catalog = () => ({
  system: [],
  apps: [
    {
      id: ID,
      appId: 'immich',
      appName: 'Immich',
      name: 'Photo library',
      template: 'twoStat',
      needsKey: true,
      hasKey: true,
    },
  ],
});
/** The widget's card, found by its title "<App> · <widget>" (on a phone the logo stands for the app's name). */
const card = async () => {
  const el = (await screen.findByText('Photo library')).closest('button')!;
  expect(el).toHaveTextContent('Immich · Photo library');
  return el;
};
const figures = {
  template: 'twoStat',
  first: { value: 1204, label: 'photos' },
  second: { value: 87, label: 'videos' },
};

function widget(entry: () => unknown, role: 'admin' | 'member' = 'admin') {
  return renderScreen(
    () => <AppWidget id={ID} />,
    {
      'auth.me': fakeMe({ role }),
      'home.listWidgets': catalog,
      'apps.list': () => ({ apps: [tile('immich', 'Immich')] }),
      'home.getWidgetData': () => ({ [ID]: entry() }),
    },
    { routes: { '/apps/$appId/settings': () => <h1>Immich settings</h1> } },
  );
}

describe('US-HOME-20', () => {
  it('shows the app’s figures under "<App> · <widget>"', async () => {
    widget(() => ({ status: 'ok', data: figures, updatedAt: 1 }));
    expect(await card()).toHaveTextContent('1,204photos87videos');
  });

  it('asks again every 60 seconds while Home is showing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 0;
    const { calls } = widget(() => ({
      status: 'ok',
      data: { ...figures, first: { value: ++n, label: 'photos' } },
      updatedAt: 1,
    }));
    await card();
    const before = calls.filter((c) => c.path === 'home.getWidgetData').length;
    await act(async () => void vi.advanceTimersByTime(60_000));
    await waitFor(() => expect(calls.filter((c) => c.path === 'home.getWidgetData').length).toBe(before + 1));
  });

  it('"<App> isn’t running" when it’s stopped', async () => {
    widget(() => ({ status: 'app_not_running', updatedAt: 1 }));
    expect(await screen.findByText("Immich isn't running")).toBeInTheDocument();
  });

  it('"Couldn’t load", with the last good figures greyed', async () => {
    widget(() => ({ status: 'error', data: figures, updatedAt: 1 }));
    expect(await screen.findByText("Couldn't load")).toBeInTheDocument();
    expect(screen.getByText('1,204').closest('.opacity-45')).not.toBeNull();
  });

  it('without its key an admin is sent to the app’s settings to add one; members never see such a widget', async () => {
    widget(() => ({ status: 'needs_key', updatedAt: 1 }));
    const link = await screen.findByRole('link', { name: /Add an API key/ });
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Immich settings' })).toBeInTheDocument();
  });

  it('opens the app as its tile does (a new tab for an app that doesn’t embed)', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    widget(() => ({ status: 'ok', data: figures, updatedAt: 1 }));
    fireEvent.click(await card());
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://immich.hlabs.local'));
    open.mockRestore();
  });

  it('App settings: an admin adds the key, which never comes back to the page', async () => {
    let set = false;
    const { calls } = renderScreen(
      () => <AppWidgetKey app={{ id: 'immich', name: 'Immich' } as never} shippedPhase={7} />,
      {
        'apps.widgetKey': () => ({
          needed: true,
          set,
          help: 'Make a key in Immich under Account settings › API keys.',
        }),
        'apps.setWidgetKey': () => {
          set = true;
          return { ok: true };
        },
        'home.getWidgetData': () => ({}),
        'home.listWidgets': catalog,
      },
    );
    const section = await screen.findByRole('group', { name: 'Home widget' });
    expect(section).toHaveTextContent('Not added: the widget needs a key made in the app.');
    fireEvent.click(within(section).getByRole('button', { name: 'Add key…' }));
    const dialog = await screen.findByRole('dialog', { name: "Immich's API key" });
    expect(dialog).toHaveTextContent('Make a key in Immich under Account settings › API keys.');
    const field = within(dialog).getByLabelText('API key');
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.change(field, { target: { value: ' my-key ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save key' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setWidgetKey')?.input).toEqual({ appId: 'immich', key: 'my-key' }),
    );
    await waitFor(() => expect(section).toHaveTextContent('Added. The widget reads Immich with it.'));
    expect(document.body).not.toHaveTextContent('my-key');
  });
});
