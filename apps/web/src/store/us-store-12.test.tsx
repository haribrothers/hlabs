// US-STORE-12 · Watch install progress.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail, details, installJob } from '../test/store';
import { etaLine, InstallProgressPage, readJobMessage, stepStates } from './install-progress';

const never = () => new Promise(() => {});

function page(handlers: Handlers = {}) {
  return renderScreen(() => <InstallProgressPage appId="immich" />, {
    'store.getApp': () => details(),
    'apps.get': () => appDetail(),
    'jobs.get': () => installJob({ detail: { done: 2, of: 3 } }),
    'apps.list': () => ({ apps: [] }),
    'events.stream': never,
    ...handlers,
  });
}

describe('US-STORE-12', () => {
  it('shows the app and "Installing… 42%"', async () => {
    page();
    expect(await screen.findByRole('heading', { level: 1, name: 'Immich' })).toBeInTheDocument();
    expect(screen.getByText('Photo and video backup from your phone')).toBeInTheDocument();
    expect(screen.getByText('Apple Silicon')).toBeInTheDocument();
    expect(await screen.findByText('Installing… 42%')).toBeInTheDocument();
  });

  it('lists the steps: done ones in the past tense, the current one busy, later ones muted', async () => {
    page();
    const steps = await screen.findByRole('list', { name: 'Install steps' });
    await within(steps).findByText('2 of 3');
    const items = within(steps).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Checked compatibility');
    expect(items[0]).toHaveTextContent('arm64 images found');
    expect(items[1]).toHaveTextContent('Downloading images');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(within(items[1]!).getByRole('progressbar')).toBeInTheDocument();
    expect(items[2]).toHaveTextContent('Creating data folders');
    expect(items[4]).toHaveTextContent('Setting up immich.hlabs.local');
    expect(stepStates(appDetail(), 'folders')).toEqual({
      check: 'done',
      pull: 'done',
      folders: 'active',
      start: 'todo',
      network: 'todo',
    });
  });

  it('shows the time left from live progress, rounded up', async () => {
    page({
      'events.stream': () => ({
        id: '1',
        data: {
          type: 'app.installProgress',
          data: { appId: 'immich', jobId: 'j1', step: 'pull', progress: 50, stepDetail: {}, etaSeconds: 130 },
        },
      }),
    });
    expect(await screen.findByText('About 3 minutes left')).toBeInTheDocument();
    expect(screen.getByText('Installing… 50%')).toBeInTheDocument();
    expect(etaLine(45)).toBe('Less than a minute left');
    expect(etaLine(null)).toBeNull();
  });

  it('restores from jobs.get and says you can leave', async () => {
    page();
    expect(
      await screen.findByText("You can leave this page. Immich appears on your Home screen when it's ready."),
    ).toBeInTheDocument();
    expect(readJobMessage('{"step":"start","detail":{}}').step).toBe('start');
    expect(readJobMessage('not json').step).toBeNull();
  });

  it('a queued install is waiting for another app', async () => {
    page({ 'jobs.get': () => installJob({ state: 'queued', progress: 0, message: null }) });
    expect(await screen.findByText('Waiting for another app to finish…')).toBeInTheDocument();
  });

  it('announces a completed step politely, not the percent', async () => {
    const { container } = page();
    await screen.findByText('2 of 3');
    const live = container.ownerDocument.querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent('Checked compatibility, done');
    expect(live).not.toHaveTextContent('%');
  });
});
