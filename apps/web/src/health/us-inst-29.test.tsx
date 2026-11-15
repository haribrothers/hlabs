// US-INST-29 · Use hlabs in its own window: opened where nothing answers, "Can't reach hlabs" (AppOffline) with what to
// check, a 10-second countdown and Try again, loading the page once hlabs answers; an error page from Caddy is the
// usual daemon-down state instead; log in remembers the device by default in the installed app only. Offline for
// real (the saved shell) is checked in e2e (the pwa project).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetInstall } from '../lib/install-app';
import { UsernameView } from '../login/username-view';
import { renderScreen } from '../test/render';
import { OfflineGate, OFFLINE_POLL_SECONDS } from './app-offline';
import type { HealthCheck } from './daemon-down';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetInstall();
});

const noAnswer: HealthCheck = { ok: false, reason: null, noAnswer: true };
const ok: HealthCheck = { ok: true, reason: null, version: '0.0.2' };

describe('US-INST-29', () => {
  it('nothing answers at start: "Can\'t reach hlabs", what to check, and Try again', async () => {
    render(
      <OfflineGate check={async () => noAnswer} reload={() => {}}>
        <p>the dashboard</p>
      </OfflineGate>,
    );
    expect(await screen.findByRole('heading', { name: "Can't reach hlabs" })).toBeInTheDocument();
    expect(screen.queryByText('the dashboard')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(`Trying again in ${OFFLINE_POLL_SECONDS} seconds…`);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1Check that this computer is on your home network or connected to Tailscale.',
      '2Make sure the computer hlabs runs on is on and awake.',
    ]);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('it asks again every 10 seconds and loads the page when hlabs answers', async () => {
    // Only fake time: nothing moves unless the test moves it (real time crept in on a slow CI machine).
    vi.useFakeTimers();
    let answer = noAnswer;
    const check = vi.fn(async () => answer);
    const reload = vi.fn();
    render(
      <OfflineGate check={check} reload={reload}>
        <p>the dashboard</p>
      </OfflineGate>,
    );
    // The first check's answer arrives.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('heading', { name: "Can't reach hlabs" })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Trying again in 10 seconds…');
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole('status')).toHaveTextContent('Trying again in 5 seconds…');
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(check).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
    answer = ok;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(check).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('Try again asks at once', async () => {
    let answer = noAnswer;
    const reload = vi.fn();
    render(
      <OfflineGate check={async () => answer} reload={reload}>
        <p>the dashboard</p>
      </OfflineGate>,
    );
    await screen.findByRole('heading', { name: "Can't reach hlabs" });
    answer = { ok: false, reason: 'starting' };
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // Anything that answers, even "starting": hlabs's computer is back, and the page takes it from there.
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it("an error page (hlabs's computer answers but hlabs doesn't) is left to the daemon-down state", async () => {
    render(
      <OfflineGate check={async () => ({ ok: false, reason: null })} reload={() => {}}>
        <p>the dashboard</p>
      </OfflineGate>,
    );
    expect(await screen.findByText('the dashboard')).toBeInTheDocument();
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('heading', { name: "Can't reach hlabs" })).toBeNull();
  });

  it('log in remembers this device by default in the installed app, and only there', async () => {
    const handlers = {
      'auth.listLoginUsers': () => ({ users: [] }),
      'auth.me': () => ({ authenticated: false }),
    };
    const standalone = (on: boolean) =>
      vi.stubGlobal('matchMedia', (q: string) => ({
        matches: on && q === '(display-mode: standalone)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    standalone(true);
    const { unmount } = renderScreen(() => <UsernameView />, handlers);
    expect(await screen.findByRole('switch', { name: 'Remember me on this device' })).toBeChecked();
    unmount();
    standalone(false);
    renderScreen(() => <UsernameView />, handlers);
    expect(await screen.findByRole('switch', { name: 'Remember me on this device' })).not.toBeChecked();
  });
});
