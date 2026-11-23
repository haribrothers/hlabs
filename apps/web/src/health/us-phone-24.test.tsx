// US-PHONE-24 · Run as a standalone web app: the home-screen app is known (display-mode, and iOS's
// navigator.standalone); its log in starts with "Remember this phone" on, and only there; offline it shows "Can't
// reach hlabs" with Try again (US-INST-29's AppOffline); a new version's worker reloads the page once. Apps open in a
// new tab (browser.open), outside the hlabs window (US-PHONE-08). No browser chrome and the safe areas are the
// manifest's display and US-PHONE-02.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStandalone, reloadOnNewShell } from '../lib/install-app';
import { UsernameView } from '../login/username-view';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { OfflineGate } from './app-offline';

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { standalone?: boolean }).standalone;
});

describe('US-PHONE-24', () => {
  it('knows the home-screen app: display-mode standalone, or navigator.standalone on iOS', () => {
    const win = (standalone: boolean, ios = false) =>
      ({
        matchMedia: (q: string) => ({ matches: standalone && q === '(display-mode: standalone)' }),
        navigator: ios ? { standalone: true } : {},
      }) as unknown as Window;
    expect(isStandalone(win(true))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
    expect(isStandalone(win(false))).toBe(false);
  });

  it('first launch from the home screen: log in with "Remember this phone" on; in Safari it starts off', async () => {
    const handlers = { 'auth.listLoginUsers': () => ({ users: [] }) };
    let restore = phoneViewport(390, { '(display-mode: standalone)': true });
    const { unmount } = renderScreen(() => <UsernameView />, handlers);
    expect(await screen.findByRole('switch', { name: 'Remember this phone' })).toBeChecked();
    unmount();
    restore();
    restore = phoneViewport();
    renderScreen(() => <UsernameView />, handlers);
    expect(await screen.findByRole('switch', { name: 'Remember this phone' })).not.toBeChecked();
    restore();
  });

  it('offline: the saved shell says "Can\'t reach hlabs" with Try again, not a browser error', async () => {
    render(
      <OfflineGate check={async () => ({ ok: false, reason: null, noAnswer: true })} reload={() => {}}>
        <p>the dashboard</p>
      </OfflineGate>,
    );
    expect(await screen.findByRole('heading', { name: "Can't reach hlabs" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a new version taking over reloads the page once; the first install does not', () => {
    const listeners: Array<() => void> = [];
    const reload = vi.fn();
    const sw = (controller: unknown) => ({
      controller: controller as ServiceWorker | null,
      addEventListener: (_: string, l: () => void) => listeners.push(l),
    });
    reloadOnNewShell(sw(null) as never, reload);
    expect(listeners).toHaveLength(0);
    reloadOnNewShell(sw({}) as never, reload);
    listeners[0]!();
    listeners[0]!();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
