import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { EngineRestartControl } from './engine-restart';

const job = (kind: string, progress = 0) => ({
  id: 'j1',
  kind,
  target: null,
  state: 'running',
  progress,
  message: null,
  hlabsCode: null,
  createdAt: 1,
  finishedAt: null,
});

describe('US-SYS-18', () => {
  it('asks first: "All apps stop for about a minute." with Cancel and Restart', async () => {
    const restart = vi.fn(() => ({ jobId: 'j1' }));
    renderScreen(() => <EngineRestartControl stopped={false} />, {
      'jobs.list': () => ({ items: [] }),
      'settings.engine.restart': restart,
      'settings.engine.get': () => ({}),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Restart engine' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restart the container engine?' });
    expect(within(dialog).getByText('All apps stop for about a minute.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(restart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restart engine' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(restart).toHaveBeenCalled());
  });

  it('while it restarts, the row shows its progress', async () => {
    renderScreen(() => <EngineRestartControl stopped={false} />, {
      'jobs.list': () => ({ items: [job('engine_restart', 60)] }),
    });
    const bar = await screen.findByRole('progressbar', { name: 'Restarting the engine' });
    expect(bar).toHaveAttribute('aria-valuenow', '60');
  });

  it('while an exclusive job runs, Restart waits: "Wait for <job> to finish"', async () => {
    renderScreen(() => <EngineRestartControl stopped={false} />, { 'jobs.list': () => ({ items: [job('restore')] }) });
    const button = await screen.findByRole('button', { name: 'Restart engine' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button.parentElement).toHaveAttribute('title', 'Wait for the restore to finish');
  });

  it('a stopped engine offers Start engine, without asking', async () => {
    const start = vi.fn(() => ({ jobId: 'j1' }));
    renderScreen(() => <EngineRestartControl stopped />, {
      'jobs.list': () => ({ items: [] }),
      'settings.engine.start': start,
      'settings.engine.get': () => ({}),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Start engine' }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
