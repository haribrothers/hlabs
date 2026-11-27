// US-PHONE-07 · Phone Home header and widgets: "Home" with the greeting under it, the bell (a dot, "Notifications, 3
// new") and Search; the notifications as a bottom sheet; the saved widgets in layout order above the grid, as a row
// you swipe with page dots (D-172); Live usage opening Usage (members without usage never get it: the daemon leaves it
// out of their layout, apps/daemon/test/us-home-11.test.ts); and a long press doing nothing on a phone.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { renderScreen, type Handlers } from '../test/render';
import { HomeView } from './home-view';

const never = () => new Promise(() => {});
const GIB = 1024 ** 3;

function home(handlers: Handlers = {}) {
  return renderScreen(
    () => (
      <main id="main">
        <HomeView shippedPhase={9} />
      </main>
    ),
    {
      'auth.me': fakeMe(),
      'home.getLayout': () => ({
        items: [
          { kind: 'widget', id: 'storage' },
          { kind: 'widget', id: 'live-usage' },
        ],
        hidden: [],
        dock: [],
      }),
      'apps.list': () => ({
        apps: [
          {
            id: 'jellyfin',
            name: 'Jellyfin',
            state: 'running',
            icon: { logoUrl: null, gradient: null, fallback: null },
            embed: false,
            ownLogin: false,
            urls: { local: 'https://jellyfin.hlabs.local', tailnet: null, port: null },
          },
        ],
      }),
      'notifications.unreadCount': () => ({ count: 3 }),
      'notifications.list': () => ({ items: [], nextCursor: null }),
      'usage.current': () => ({
        ts: 1,
        host: { cpu: 18, memBytes: 9.4 * GIB, memTotalBytes: 16 * GIB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
        apps: [],
      }),
      'storage.summary': () => ({
        totalBytes: 256e9,
        freeBytes: 142e9,
        appsBytes: 77e9,
        filesBytes: 0,
        systemBytes: 37e9,
        hlabsBytes: 0,
        backupCacheBytes: 0,
        reclaimableImageBytes: 0,
      }),
      'events.stream': never,
      'account.get': () => ({ adminName: 'Hari' }),
      ...handlers,
    },
  );
}

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 22, 19, 0));
});
afterEach(() => {
  restore();
  vi.useRealTimers();
});

describe('US-PHONE-07', () => {
  it('the header: "Home", "Good evening, Hari", the bell and Search', async () => {
    home();
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Home' });
    const header = h1.closest('header')!;
    expect(await within(header).findByText('Good evening, Hari. Your app is running.')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Notifications, 3 new' })).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/settings/account');
    // Search right under the header (the field opens Spotlight, US-PHONE-09).
    const search = screen.getByRole('button', { name: 'Search' });
    expect(header.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('3 unread: a dot (not a number) on the bell; it opens the notifications as a bottom sheet', async () => {
    home();
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 new' });
    expect(bell).not.toHaveTextContent('3');
    expect(bell.querySelector('.hl-p-dot')).not.toBeNull();
    fireEvent.click(bell);
    const sheet = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(sheet).toHaveClass('hl-sheet');
  });

  it('the widgets in layout order, above the app grid; Live usage shows CPU and Memory and opens Usage', async () => {
    const { router } = home();
    const widgets = await screen.findByRole('region', { name: 'Widgets' });
    const storage = await within(widgets).findByRole('link', { name: /^Storage/ });
    const usage = await within(widgets).findByRole('link', { name: /^Live usage/ });
    // Layout order, and the widgets come before the apps.
    expect(storage.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const grid = screen.getByRole('list', { name: 'Apps' });
    expect(widgets.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(usage).toHaveTextContent(/CPU\s*18%/));
    expect(usage).toHaveTextContent('59%');
    await waitFor(() => expect(storage).toHaveTextContent('142 GB'));
    expect(storage).toHaveTextContent('left of 256 GB');
    const links = [storage, usage];
    fireEvent.click(links[1]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/usage'));
  });

  it('widgets form a row you swipe, two to a screen, with page dots; each keeps its own link', async () => {
    home({
      'home.getLayout': () => ({
        items: [
          { kind: 'widget', id: 'storage' },
          { kind: 'widget', id: 'live-usage' },
          { kind: 'widget', id: 'my-files' },
        ],
        hidden: [],
        dock: [],
      }),
    });
    const widgets = await screen.findByRole('region', { name: 'Widgets' });
    const row = widgets.querySelector('.hl-p-widgets')!;
    expect(row).toHaveClass('overflow-x-auto', 'snap-x');
    // Each screen starts with a snap point: the first and third widgets.
    const cards = [...row.querySelectorAll('.hl-p-widget')];
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.classList.contains('snap-start'))).toEqual([true, false, true]);
    // Two screens: two dots, the first one current.
    const dots = widgets.querySelectorAll('.hl-p-dots > span');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('data-current');
    expect(dots[1]).not.toHaveAttribute('data-current');
    expect(await within(widgets).findByRole('link', { name: /^Storage/ })).toBeInTheDocument();
  });

  it('a long press on Home does nothing on a phone: no edit mode', async () => {
    vi.useRealTimers();
    home();
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    const main = document.getElementById('main')!;
    fireEvent.pointerDown(main, { button: 0, clientX: 10, clientY: 10 });
    await act(() => new Promise((r) => setTimeout(r, 650)));
    fireEvent.pointerUp(main);
    expect(screen.queryByText('Drag to rearrange')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});
