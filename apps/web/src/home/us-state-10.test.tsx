// US-STATE-10 · Recover automatically when the engine comes back.
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineWatch } from '../lib/engine-state';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { HomeView } from './home-view';

const info = (running: boolean) => ({ engine: { kind: 'orbstack', running, version: null } });
const status = (running: boolean) => ({
  id: String(Math.random()),
  data: { type: 'engine.status', data: { running, kind: 'orbstack', managedByHlabs: false, socketPath: '/x.sock' } },
});

function home(startsRunning: boolean) {
  let engine = startsRunning;
  let publish!: (event: unknown) => void;
  const event = new Promise((r) => (publish = r));
  renderScreen(
    () => (
      <>
        <HomeView />
        <EngineWatch />
      </>
    ),
    {
      'auth.me': fakeMe({ role: 'member' }),
      'home.getLayout': () => ({ items: [], dock: [] }),
      'apps.list': () => ({ apps: [] }),
      'system.info': () => info(engine),
      'events.stream': () => event,
    },
  );
  return {
    report: async (running: boolean) => {
      engine = running;
      await act(async () => publish(status(running)));
    },
  };
}

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-STATE-10', () => {
  it('the engine coming back (started elsewhere) hides the banner within 2 s and says so once', async () => {
    const { report } = home(false);
    const banner = await screen.findByRole('status', {}, { timeout: 2_500 });
    expect(banner).toHaveTextContent('The container engine has stopped');
    await report(true);
    await waitFor(() => expect(screen.queryByText('The container engine has stopped')).toBeNull(), {
      timeout: 2_000,
    });
    expect(currentToasts().filter((t) => t.title === 'The container engine is running')).toEqual([
      expect.objectContaining({ tone: 'success' }),
    ]);
  });

  it('no toast when it was running all along', async () => {
    const { report } = home(true);
    await new Promise((r) => setTimeout(r, 50));
    await report(true);
    expect(currentToasts().filter((t) => t.title === 'The container engine is running')).toEqual([]);
  });
});
