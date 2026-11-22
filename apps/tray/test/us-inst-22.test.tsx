// US-INST-22 · Uninstall removes hlabs cleanly, the window's side (D-143): macOS confirms first; then the steps show as
// a checklist: the daemon's job stops the apps (and removes Colima), then hlabs is removed, the data deleted when
// asked, and hlabs goes to the Trash. A failed step says what to do, with Try again from that step and Copy
// diagnostics; hlabs isn't moved to the Trash.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DaemonCallError } from '../src/daemon';
import { Uninstall } from '../src/uninstall';
import { actions } from './uninstall-actions';

const steps = () =>
  screen
    .getAllByRole('listitem')
    .map((li) => li.textContent)
    .join(' | ');

async function start(a: ReturnType<typeof actions>, choose?: () => Promise<void>) {
  render(<Uninstall actions={a} pollMs={1} />);
  await screen.findByText(/apps stop/);
  await choose?.();
  await userEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
}

describe('US-INST-22 · Uninstall removes hlabs cleanly', () => {
  it('keeping the data: confirm, stop the apps, remove hlabs, then the Trash', async () => {
    const a = actions();
    await start(a);
    await waitFor(() => expect(a.quit).toHaveBeenCalled());
    expect(a.confirm).toHaveBeenCalled();
    expect(a.start).toHaveBeenCalledWith({ keepData: true, removeColima: false });
    expect(a.removeHlabs).toHaveBeenCalled();
    expect(a.deleteData).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Uninstalling hlabs' })).toHaveTextContent('Your data stays in ~/hlabs');
    expect(steps()).toBe('Stopping apps (done) | Removing hlabs (done)');
  });

  it('deleting everything with Colima: every step, the data from the storage root', async () => {
    let calls = 0;
    const a = actions({
      job: vi.fn(async () => {
        calls++;
        return {
          id: 'job1',
          state: calls < 2 ? 'running' : calls < 3 ? 'running' : 'succeeded',
          message: calls >= 2 ? 'removingColima' : 'stoppingApps',
        } as never;
      }),
    });
    await start(a, async () => {
      await userEvent.click(screen.getByRole('radio', { name: /Delete everything/ }));
      await userEvent.click(screen.getByRole('checkbox', { name: /Also remove Colima/ }));
    });
    await waitFor(() => expect(a.quit).toHaveBeenCalled());
    expect(a.start).toHaveBeenCalledWith({ keepData: false, removeColima: true });
    expect(a.deleteData).toHaveBeenCalledWith('/Users/hari/hlabs');
    expect(steps()).toBe(
      'Stopping apps (done) | Removing Colima (done) | Removing hlabs (done) | Deleting data (done)',
    );
    expect(screen.getByText('Deleting everything')).toBeInTheDocument();
  });

  it('cancelling the macOS prompt changes nothing and keeps the choices', async () => {
    const a = actions({ confirm: vi.fn(async () => false) });
    await start(a, () => userEvent.click(screen.getByRole('radio', { name: /Delete everything/ })));
    await waitFor(() => expect(a.confirm).toHaveBeenCalled());
    expect(a.start).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Delete everything/ })).toBeChecked();
  });

  it('a failed step says what to do; Try again goes on from that step; hlabs stays out of the Trash', async () => {
    const removeHlabs = vi.fn().mockRejectedValueOnce('launchctl said no').mockResolvedValue(undefined);
    const a = actions({ removeHlabs });
    await start(a);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("hlabs couldn't remove its background service. Try again.");
    expect(steps()).toBe("Stopping apps (done) | Removing hlabs (didn't finish)");
    expect(a.quit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }));
    expect(a.copyDiagnostics).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(a.quit).toHaveBeenCalled());
    // The apps weren't stopped again.
    expect(a.start).toHaveBeenCalledTimes(1);
    expect(removeHlabs).toHaveBeenCalledTimes(2);
  });

  it('apps that don’t stop, or another task running, say so', async () => {
    const a = actions({ job: vi.fn(async () => ({ id: 'job1', state: 'failed' }) as never) });
    await start(a);
    expect(await screen.findByRole('alert')).toHaveTextContent("Some apps couldn't be stopped.");
    expect(a.removeHlabs).not.toHaveBeenCalled();

    const busy = actions({
      start: vi
        .fn()
        .mockRejectedValue(new DaemonCallError({ kind: 'api', hlabsCode: 'JOB_EXCLUSIVE_RUNNING', status: 409 })),
    });
    document.body.innerHTML = '';
    await start(busy);
    expect(await screen.findByRole('alert')).toHaveTextContent('hlabs is busy with another task');
    expect(within(screen.getByRole('region')).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
