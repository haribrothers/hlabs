// US-ACCT-34 · Home screen options: "Show widgets" and "Show greeting" (with the example greeting), both on by
// default; Home leaves out the widgets or the greeting when they're off, and greets by the time of day.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from '../home/home-view';
import { greetingFor } from '../home/greeting';
import { DEFAULT_APPEARANCE, renderAppearance, resetRoot } from '../test/appearance';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';

beforeEach(resetRoot);
afterEach(() => vi.useRealTimers());

const at = (h: number, m: number) => new Date(2026, 10, 23, h, m);

function home(appearance: Partial<typeof DEFAULT_APPEARANCE>) {
  return renderScreen(() => <HomeView />, {
    'auth.me': fakeMe({ appearance: { ...DEFAULT_APPEARANCE, ...appearance } }),
    'home.getLayout': () => ({ items: [{ kind: 'widget', id: 'storage' }], dock: [] }),
    'home.getWidgetData': () => ({}),
    'storage.summary': () => new Promise(() => {}),
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
    'events.stream': () => new Promise(() => {}),
  });
}

describe('US-ACCT-34', () => {
  it('"Show widgets" and "Show greeting" (“Good evening, Hari”), both on by default, saved when switched', async () => {
    const { update } = renderAppearance();
    const widgets = await screen.findByRole('switch', { name: 'Show widgets' });
    const greeting = screen.getByRole('switch', { name: 'Show greeting' });
    expect(widgets).toBeChecked();
    expect(greeting).toBeChecked();
    expect(screen.getByText('“Good evening, Hari”')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Home screen' })).toBeInTheDocument();
    fireEvent.click(widgets);
    await waitFor(() => expect(widgets).not.toBeChecked());
    expect(update).toHaveBeenCalledWith({ showWidgets: false });
    fireEvent.click(greeting);
    await waitFor(() => expect(greeting).not.toBeChecked());
    expect(update).toHaveBeenLastCalledWith({ showGreeting: false });
  });

  it('Home shows the widgets and the greeting while both are on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(20, 0) });
    home({});
    expect(await screen.findByRole('region', { name: 'Widgets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Good evening, Hari' })).not.toHaveClass('sr-only');
  });

  it('"Show widgets" off: no widgets on Home, only the apps', async () => {
    home({ showWidgets: false });
    expect(await screen.findByText('Jellyfin')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Widgets' })).toBeNull();
  });

  it('"Show greeting" off: the greeting line is hidden (it stays the page heading for screen readers)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(9, 0) });
    home({ showGreeting: false });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveClass('sr-only');
    expect(await screen.findByRole('region', { name: 'Widgets' })).toBeInTheDocument();
  });

  it('greets by local time: morning 05:00–11:59, afternoon 12:00–17:59, evening 18:00–04:59', () => {
    expect(greetingFor(at(5, 0))).toBe('morning');
    expect(greetingFor(at(11, 59))).toBe('morning');
    expect(greetingFor(at(12, 0))).toBe('afternoon');
    expect(greetingFor(at(17, 59))).toBe('afternoon');
    expect(greetingFor(at(18, 0))).toBe('evening');
    expect(greetingFor(at(4, 59))).toBe('evening');
  });
});
