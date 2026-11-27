// US-PHONE-27 · Live usage, notifications and updates on the phone in the new design (PhoneRedesignA_Usage,
// _Notifications, _StoreUpdates, _Updates; D-172, D-174): "Live usage" as a large title over the range as a segmented
// control, the tiles two to a row with how full each is, the chart in a box and "Apps by memory"; the bell's sheet
// with "Mark all read" and ✕ beside its title and Today / Earlier as inset boxes; the App Store's Updates with "Update
// all" in the bar and Update pills; Settings › Updates with a box for hlabs and the apps as inset rows. What each does
// is unchanged.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bell, NOW, SAMPLE } from '../test/notifications';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { updatesData, updatesPage, DAY, icon } from '../test/updates';
import { AppUpdates } from '../settings/app-updates';
import { UpdatesSection } from '../settings/updates-section';
import { UsagePage } from './usage-page';

const GIB = 1024 ** 3;

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  vi.useRealTimers();
});

function usage() {
  return renderScreen(UsagePage, {
    'usage.overview': () => ({
      cpuModel: 'Apple M1',
      cores: 8,
      memTotalBytes: 16 * GIB,
      storage: { usedBytes: 114e9, totalBytes: 256e9, appsBytes: 1, filesBytes: 1, systemBytes: 1 },
      engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GIB },
    }),
    'usage.current': () => ({
      ts: 1,
      host: {
        cpu: 18,
        memBytes: 9.4 * GIB,
        memTotalBytes: 16 * GIB,
        netRx: 2.1e6,
        netTx: 3e5,
        diskRead: 0,
        diskWrite: 0,
      },
      apps: [],
    }),
    'usage.history': () => ({
      scope: 'host',
      range: '1h',
      resolution: '5s',
      points: [10, 46, 18].map((c, i) => ({
        ts: i * 60_000,
        cpu: c,
        memBytes: 9e9,
        netRx: 1,
        netTx: 1,
        diskRead: 0,
        diskWrite: 0,
      })),
      peak: null,
    }),
    'apps.list': () => ({
      apps: [
        {
          id: 'immich',
          name: 'Immich',
          state: 'running',
          icon,
          embed: false,
          ownLogin: false,
          urls: { local: 'https://immich.hlabs.local', tailnet: null, port: null },
        },
      ],
    }),
    'events.stream': () => new Promise(() => {}),
  });
}

describe('US-PHONE-27', () => {
  it('Live usage: a large title with the engine under it, the range across the page and the tiles two to a row', async () => {
    usage();
    const title = await screen.findByRole('heading', { level: 1, name: 'Live usage' });
    expect(title).toHaveClass('hl-p-large');
    expect(await screen.findByText('Container VM (Colima) · 4 CPUs · 8 GB allocated')).toHaveClass('hl-p-subtitle');
    expect(screen.getByRole('radiogroup', { name: 'Time range' })).toHaveClass('hl-seg-fill');
    const tiles = screen.getByRole('group', { name: 'Summary' });
    expect(tiles).toHaveClass('grid-cols-2');
    const cpu = within(tiles).getByRole('button', { name: /^CPU/ });
    expect(cpu).toHaveClass('hl-p-tile');
    await waitFor(() => expect(cpu).toHaveTextContent('18%'));
    // How full: a bar at the CPU's share; Network has none.
    expect((cpu.querySelector('.hl-p-meter > span') as HTMLElement).style.width).toBe('18%');
    expect(
      within(tiles)
        .getByRole('button', { name: /^Network/ })
        .querySelector('.hl-p-meter'),
    ).toBeNull();
  });

  it('Live usage: the chart in a box and the apps under "Apps by memory", still a sortable table', async () => {
    usage();
    const table = await screen.findByRole('table', { name: 'Apps' });
    expect(screen.getByRole('heading', { level: 2, name: 'Apps by memory' })).toBeInTheDocument();
    expect(table.closest('section')).toHaveClass('hl-p-group');
    expect(document.querySelector('[aria-busy], .hl-p-card')).not.toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: 'CPU' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Apps by CPU' })).toBeInTheDocument();
    localStorage.removeItem('hlabs.usage.sort');
  });

  it('the bell: a full-height sheet named "Notifications", "Mark all read" and ✕ beside the title, Today and Earlier as inset boxes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    bell({
      'notifications.unreadCount': () => ({ count: 3 }),
      'notifications.list': () => ({ items: SAMPLE, nextCursor: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 3 new' }));
    const sheet = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(sheet).toHaveClass('hl-sheet', 'hl-sheet-full');
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    const head = sheet.querySelector('.hl-sheet-head[data-large]') as HTMLElement;
    expect(within(head).getByRole('button', { name: 'Mark all read' })).toBeEnabled();
    expect(within(head).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const today = await within(sheet).findByRole('region', { name: 'Today' });
    expect(within(today).getByRole('list')).toHaveClass('hl-p-group');
    expect(within(today).getAllByRole('listitem')[0]).toHaveClass('hl-p-note');
    expect(within(sheet).getByRole('region', { name: 'Earlier' })).toBeInTheDocument();
    expect(within(today).getAllByText('Unread').length).toBeGreaterThan(0);
    expect(within(today).getAllByRole('button', { name: /^Dismiss "/ }).length).toBeGreaterThan(0);
  });

  it('App Store › Updates: "‹ App Store", "Update all" in the bar, when hlabs checked under the title, Update pills', async () => {
    updatesPage({
      'store.listUpdates': () =>
        updatesData({
          recent: [
            {
              appId: 'jellyfin',
              name: 'Jellyfin',
              icon,
              version: '10.9',
              at: Date.now() - DAY - 60_000,
              automatic: true,
              notBackedUp: false,
            },
          ],
        }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Updates' })).toHaveClass('hl-p-large');
    expect(screen.getAllByRole('button', { name: /App Store/ })[0]).toHaveClass('hl-p-back');
    const all = await screen.findAllByRole('button', { name: 'Update all (2)' });
    expect(all.at(-1)).toHaveTextContent(/^Update all$/);
    expect(screen.getByText(/^Checked 5 minutes ago · apps restart briefly while they update$/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Updates' });
    expect(list).toHaveClass('hl-p-group');
    expect(within(list).getByRole('button', { name: 'Update Immich' })).toHaveClass('hl-p-get');
    expect(within(list).getAllByRole('button', { name: "What's new" })[0]).toHaveClass('hl-p-urow-link');
    expect(screen.getByRole('list', { name: 'Recently updated' })).toHaveTextContent(
      /Updated (today|yesterday) · automatically/,
    );
  });

  it('Settings › Updates: a box with hlabs, its notes and a full-width "Update now"', async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => ({
        version: '1.4.0',
        channel: 'stable',
        autoHlabs: true,
        autoApps: false,
        backupBeforeUpdate: true,
        lastCheckedAt: Date.now() - 90 * 60_000,
        available: { version: '1.5.0', notes: ['Faster installs'], url: 'https://example.invalid/notes' },
        blockedBy: null,
      }),
      'store.listUpdates': () => updatesData(),
      'jobs.list': () => ({ items: [] }),
      'events.stream': () => new Promise(() => {}),
    });
    const box = await screen.findByRole('region', { name: 'hlabs 1.5.0 is available' });
    expect(box).toHaveClass('hl-p-card');
    expect(within(box).getByRole('button', { name: 'Update now' })).toHaveClass('hl-p-primary');
    expect(within(box).getByText('Faster installs')).toBeInTheDocument();
  });

  it('Settings › Updates: "App updates · 2" with Update all, each app as an inset row with "What\'s new" and an Update pill', async () => {
    renderScreen(AppUpdates, {
      'store.listUpdates': () => updatesData(),
      'jobs.list': () => ({ items: [] }),
      'events.stream': () => new Promise(() => {}),
    });
    const heading = await screen.findByRole('heading', { name: 'App updates · 2' });
    expect(heading).toHaveClass('hl-p-label');
    const rows = [...document.querySelectorAll<HTMLElement>('.hl-p-group > li.hl-p-row')];
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByRole('button', { name: 'Update Immich' })).toHaveClass('hl-p-get');
    fireEvent.click(within(rows[1]!).getByRole('button', { name: "What's new" }));
    expect(await screen.findByRole('dialog', { name: "What's new in Immich 1.1" })).toHaveClass('hl-sheet');
  });
});
