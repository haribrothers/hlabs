// US-APP-01 · Open an app in a window.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppGrid, type HomeApp } from '../home/app-grid';
import { browser } from '../lib/browser';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppWindow, SLOW_AFTER_MS, SPINNER_AFTER_MS } from './app-window';
import { appBaseUrl } from './use-app';

const never = () => new Promise(() => {});
/** The button in the frame area (the header has its own "Open in a new tab", US-APP-02). */
const panelButton = (name: string) => screen.getAllByRole('button', { name }).find((b) => !b.title)!;
const jellyfin = appDetail({
  id: 'jellyfin',
  name: 'Jellyfin',
  state: 'running',
  embed: true,
  ownLogin: false,
  address: 'jellyfin.hlabs.local',
  urls: { local: 'https://jellyfin.hlabs.local', tailnet: 'https://hlabs.tail1234.ts.net:12004' },
  webPath: '/web/',
});

function open(app = jellyfin) {
  return renderScreen(
    () => <AppWindow appId={app.id} />,
    { 'apps.get': () => app, 'events.stream': never },
    { path: '/apps/x' },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('US-APP-01', () => {
  it('shows the app with its icon, name, status and address, and its interface in a frame', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Jellyfin' })).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('jellyfin.hlabs.local')).toBeInTheDocument();
    // Its icon is drawn beside the name, so screen readers hear the name once.
    const banner = screen.getByRole('banner');
    expect(banner.querySelector('[data-state="fallback"]')).not.toBeNull();
    expect(within(banner).queryByRole('img', { name: 'Jellyfin' })).toBeNull();
    expect(screen.getByTitle('Jellyfin')).toHaveAttribute('src', 'https://jellyfin.hlabs.local/web/');
  });

  it('on the tailnet name the frame uses the tailnet address (D-012)', () => {
    expect(appBaseUrl(jellyfin, { hostname: 'hlabs.tail1234.ts.net' })).toBe('https://hlabs.tail1234.ts.net:12004');
    expect(appBaseUrl(jellyfin, { hostname: 'hlabs.local' })).toBe('https://jellyfin.hlabs.local');
  });

  it('shows a spinner after 1 s without load, and a way out after 20 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const openTab = vi.spyOn(browser, 'open').mockImplementation(() => {});
    open();
    await screen.findByTitle('Jellyfin');
    expect(screen.queryByRole('img', { name: 'Loading Jellyfin' })).toBeNull();
    await act(async () => vi.advanceTimersByTime(SPINNER_AFTER_MS));
    expect(screen.getByRole('img', { name: 'Loading Jellyfin' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(SLOW_AFTER_MS - SPINNER_AFTER_MS));
    expect(screen.getByText('This app is taking a while to respond.')).toBeInTheDocument();
    fireEvent.click(panelButton('Open in a new tab'));
    expect(openTab).toHaveBeenCalledWith('https://jellyfin.hlabs.local/web/');
  });

  it('once the frame loads, nothing covers it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    fireEvent.load(await screen.findByTitle('Jellyfin'));
    await act(async () => vi.advanceTimersByTime(SLOW_AFTER_MS));
    expect(screen.queryByText('This app is taking a while to respond.')).toBeNull();
  });

  it('"Close app", "Back to Home" and Esc return to Home without stopping the app', async () => {
    for (const how of ['Close app', 'Back to Home', 'Escape'] as const) {
      const { router, calls, unmount } = open();
      await screen.findByTitle('Jellyfin');
      if (how === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
      else fireEvent.click(screen.getByRole('button', { name: how }));
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(calls.some((c) => c.path.startsWith('apps.stop'))).toBe(false);
      unmount();
    }
  });

  it("an app that doesn't declare web.embed says it opens in its own tab", async () => {
    const openTab = vi.spyOn(browser, 'open').mockImplementation(() => {});
    open({ ...jellyfin, embed: false });
    expect(await screen.findByText('Jellyfin opens in its own tab.')).toBeInTheDocument();
    expect(screen.queryByTitle('Jellyfin')).toBeNull();
    fireEvent.click(panelButton('Open in a new tab'));
    expect(openTab).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
  });

  it('on Home an embeddable app opens the window; any other running app opens in a new tab', async () => {
    const openTab = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const tile = (id: string, embed: boolean): HomeApp => ({
      id,
      name: id,
      state: 'running',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed,
      ownLogin: false,
      urls: { local: `https://${id}.hlabs.local`, tailnet: null },
    });
    const { router } = renderScreen(
      () => <AppGrid apps={[tile('jellyfin', true), tile('gitea', false)]} isAdmin={false} />,
      {},
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Open gitea' }));
    expect(openTab).toHaveBeenCalledWith('https://gitea.hlabs.local');
    fireEvent.click(screen.getByRole('button', { name: 'Open jellyfin' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/apps/jellyfin'));
  });
});
