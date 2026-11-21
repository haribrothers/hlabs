// US-BKP-19 · Confirm a restore with my password: the question names what happens, a wrong password says so and
// starts nothing, the right one starts it and step 3 opens; a copy asks too.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, destination } from '../test/backups';
import { daemonError, renderScreen } from '../test/render';
import { points, restoreView, snapshotItems } from '../test/restore';
import { RestoreFlow } from './restore-flow';

function open(over: Record<string, (i: unknown) => unknown> = {}) {
  return renderScreen(
    () => <RestoreFlow destinations={[destination()]} jobId={null} onClose={() => {}} />,
    backupsHandlers({
      'backups.listSnapshots': () => points(),
      'backups.getSnapshot': () => snapshotItems(),
      'backups.getRestore': () => restoreView(),
      ...over,
    }),
  );
}

describe('US-BKP-19', () => {
  it('replace: “Replace Vaultwarden with its data from today, …?”, a wrong password says so; the right one starts it', async () => {
    const { calls } = open({
      'backups.restore': (input) => {
        if ((input as { password: string }).password !== 'right') throw daemonError('AUTH_INVALID_PASSWORD');
        return { jobId: 'j1' };
      },
    });
    const step2 = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    fireEvent.click(await within(step2).findByRole('checkbox', { name: 'Vaultwarden' }));
    fireEvent.click(within(step2).getByRole('button', { name: 'Restore' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: /^Replace Vaultwarden with its data from today, \d\d:\d\d\?$/,
    });
    expect(confirm).toHaveTextContent('Vaultwarden stops until the restore finishes.');
    const field = within(confirm).getByLabelText('Your password');
    fireEvent.change(field, { target: { value: 'wrong' } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Replace data' }));
    expect(await within(confirm).findByText("That password isn't right")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'right' } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Replace data' }));
    expect(await screen.findByRole('dialog', { name: /Restoring Vaultwarden/ })).toHaveTextContent('Step 3 of 3');
    expect(calls.filter((c) => c.path === 'backups.restore').at(-1)!.input).toMatchObject({
      destinationId: 'd1',
      snapshotId: 'p3',
      scope: { mode: 'replace', apps: ['vaultwarden'], folders: [] },
    });
  });

  it('a copy asks for the password too: “Copy Vaultwarden’s data from … to Home › Restored?”', async () => {
    open({ 'backups.restore': () => ({ jobId: 'j1' }) });
    const step2 = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    fireEvent.click(within(step2).getByRole('radio', { name: /Restore as a copy/ }));
    fireEvent.click(await within(step2).findByRole('checkbox', { name: 'Vaultwarden' }));
    fireEvent.click(within(step2).getByRole('button', { name: 'Restore' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: /^Copy Vaultwarden's data from today, \d\d:\d\d to Home › Restored\?$/,
    });
    expect(within(confirm).getByLabelText('Your password')).toBeInTheDocument();
  });

  it('not enough room says how much to free', async () => {
    open({
      'backups.restore': () => {
        throw daemonError('DISK_FULL', { neededBytes: 1.2e9 });
      },
    });
    const step2 = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    fireEvent.click(await within(step2).findByRole('checkbox', { name: 'Vaultwarden' }));
    fireEvent.click(within(step2).getByRole('button', { name: 'Restore' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.change(within(confirm).getByLabelText('Your password'), { target: { value: 'right' } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Replace data' }));
    await waitFor(() =>
      expect(confirm).toHaveTextContent('Not enough free space to restore safely. Free up 1.2 GB and try again.'),
    );
  });
});
