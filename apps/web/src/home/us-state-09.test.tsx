// US-STATE-09 · Start the engine from the banner.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { HomeView } from './home-view';

const never = () => new Promise(() => {});
const info = { engine: { kind: 'orbstack', running: false, version: null } };

function home(handlers: Handlers = {}, role: 'admin' | 'member' = 'admin') {
  return renderScreen(() => <HomeView />, {
    'auth.me': fakeMe({ role }),
    'home.getLayout': () => ({ items: [], dock: [] }),
    'apps.list': () => ({ apps: [] }),
    'system.info': () => info,
    'jobs.list': () => ({ items: [] }),
    'events.stream': never,
    ...handlers,
  });
}

const startButton = () => screen.findByRole('button', { name: /Start engine|Starting…/ }, { timeout: 2_500 });

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-STATE-09', () => {
  it('Start engine starts it once: "Starting…" with a spinner, however often it is pressed', async () => {
    let jobs: unknown[] = [];
    const { calls } = home({
      'settings.engine.start': () => {
        jobs = [{ id: 'j1', kind: 'engine_start', state: 'running', progress: 5 }];
        return { jobId: 'j1' };
      },
      'jobs.list': () => ({ items: jobs }),
    });
    const button = await startButton();
    expect(button).toHaveTextContent('Start engine');
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent('Starting…'));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(calls.filter((c) => c.path === 'settings.engine.start')).toHaveLength(1);
  });

  it('while another task that runs alone is going, it waits: "Wait for the current task to finish"', async () => {
    home({ 'jobs.list': () => ({ items: [{ id: 'r', kind: 'restore', state: 'running', progress: 10 }] }) });
    const button = await startButton();
    await waitFor(() => expect(button).toBeDisabled());
    expect(button.parentElement).toHaveAttribute('title', 'Wait for the current task to finish');
  });

  it('a start that fails says so with Details, and the button is back', async () => {
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    home({ 'events.stream': () => event });
    await startButton();
    await act(async () =>
      publish({
        id: '1',
        data: {
          type: 'job.finished',
          data: { jobId: 'j1', kind: 'engine_start', target: null, state: 'failed', hlabsCode: 'ENGINE_START_FAILED' },
        },
      }),
    );
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(
        expect.objectContaining({
          tone: 'danger',
          title: "The engine didn't start",
          actions: [expect.objectContaining({ label: 'Details', to: '/settings/engine' })],
        }),
      ),
    );
    expect(await startButton()).toHaveTextContent('Start engine');
  });

  it('members never see Start engine', async () => {
    home({}, 'member');
    await screen.findByRole('link', { name: 'Details' }, { timeout: 2_500 });
    expect(screen.queryByRole('button', { name: /Start engine/ })).toBeNull();
  });
});
