// US-SYS-25 · Update apps from Settings.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { AppUpdates } from './app-updates';

const icon = { logoUrl: null, gradient: null, fallback: null };
const pending = (appId: string, name: string, from: string, to: string, releaseNotes: string | null = null) => ({
  appId,
  name,
  icon,
  state: 'running',
  fromVersion: from,
  toVersion: to,
  releaseNotes,
});
const list = (extra: Record<string, unknown> = {}) => ({
  pending: [
    pending('home-assistant', 'Home Assistant', '2026.9', '2026.10', '- Faster dashboards\n- New energy cards'),
    pending('immich', 'Immich', '1.2', '1.3'),
  ],
  rolledBack: [],
  lastCheckedAt: null,
  ...extra,
});
const handlers = (extra: Record<string, unknown> = {}) => ({
  'store.listUpdates': () => list(),
  'jobs.list': () => ({ items: [] }),
  'events.stream': () => new Promise(() => {}),
  ...extra,
});

describe('US-SYS-25', () => {
  it('"App updates · 2": each app with its versions, "What\'s new" and "Update"; "Update all" waits for phase 7', async () => {
    renderScreen(AppUpdates, handlers());
    expect(await screen.findByRole('heading', { name: 'App updates · 2' })).toBeInTheDocument();
    const rows = [...document.querySelectorAll<HTMLElement>('.hl-list-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Home Assistant');
    expect(rows[0]).toHaveTextContent('2026.9 → 2026.10');
    expect(within(rows[0]!).getByRole('button', { name: "What's new" })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Update Home Assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update all' })).toBeNull();
  });

  it('"What\'s new" shows the release notes in a dialog', async () => {
    renderScreen(AppUpdates, handlers());
    fireEvent.click((await screen.findAllByRole('button', { name: "What's new" }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: "What's new in Home Assistant 2026.10" });
    expect(await within(dialog).findByText('Faster dashboards')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Update" starts the update and the row shows its progress', async () => {
    const update = vi.fn((_input: { appId: string }) => ({ jobId: 'j1' }));
    let running = false;
    renderScreen(
      AppUpdates,
      handlers({
        'apps.update': (input: unknown) => {
          running = true;
          return update(input as never);
        },
        'jobs.list': () => ({
          items: running
            ? [
                {
                  id: 'j1',
                  kind: 'app_update',
                  target: 'immich',
                  state: 'running',
                  progress: 40,
                  message: null,
                  hlabsCode: null,
                  createdAt: 1,
                  finishedAt: null,
                },
              ]
            : [],
        }),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Update Immich' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ appId: 'immich' }));
    const bar = await screen.findByRole('progressbar', { name: 'Updating Immich' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
  });

  it('an update that rolled back says so and links to what happened', async () => {
    renderScreen(
      AppUpdates,
      handlers({
        'store.listUpdates': () =>
          list({
            rolledBack: [{ appId: 'immich', name: 'Immich', fromVersion: '1.2', toVersion: '1.3', restored: true }],
          }),
      }),
    );
    const link = await screen.findByRole('link', { name: "Immich's update rolled back: see what happened" });
    expect(link).toHaveTextContent('Rolled back');
    expect(link).toHaveAttribute('href', '/store/app/immich');
  });

  it('no app updates: "All apps are up to date"', async () => {
    renderScreen(AppUpdates, handlers({ 'store.listUpdates': () => list({ pending: [] }) }));
    expect(await screen.findByText('All apps are up to date')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'App updates' })).toBeInTheDocument();
  });
});
