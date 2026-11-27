// US-SYS-37 · Confirm a factory reset: "Reset…" opens "Reset hlabs to factory settings?" listing what goes and what
// stays (the apps' count, accounts and settings, the backup destination by name), "Keep everyone's Home folders"
// (off), "Your password" and "Type <hostname> to confirm". "Reset hlabs" stays disabled until the hostname is typed
// exactly and a password is there; a wrong password says "That password isn't right".
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRestarting, restartingNow } from '../health/restarting';
import { daemonError } from '../test/render';
import { renderAdvanced } from '../test/advanced';

beforeEach(() => {
  sessionStorage.clear();
  clearRestarting();
});

async function open(over: Parameters<typeof renderAdvanced>[0] = {}) {
  const r = renderAdvanced(over);
  const danger = await screen.findByRole('group', { name: 'Danger zone' });
  expect(within(danger).getByText('Deletes all apps, users and settings')).toBeInTheDocument();
  const button = within(danger).getByRole('button', { name: 'Reset…' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  const dialog = await screen.findByRole('alertdialog', { name: 'Reset hlabs to factory settings?' });
  return { ...r, dialog };
}

describe('US-SYS-37', () => {
  it('says what is deleted and what is not, with the Home folders choice, password and hostname', async () => {
    const { dialog } = await open();
    expect(await within(dialog).findByText('All 3 apps and their data are deleted')).toBeInTheDocument();
    expect(within(dialog).getByText('All user accounts and settings are removed')).toBeInTheDocument();
    expect(await within(dialog).findByText('Backups on your NAS are not touched')).toBeInTheDocument();
    const keep = within(dialog).getByRole('checkbox', { name: "Keep everyone's Home folders" });
    expect(keep).not.toBeChecked();
    expect(within(dialog).getByLabelText('Your password')).toHaveAttribute('type', 'password');
    expect(within(dialog).getByLabelText('Type hlabs to confirm')).toBeInTheDocument();
    // Cancel has focus first: nothing destructive happens on Enter.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('"Reset hlabs" waits for the hostname typed exactly and a password', async () => {
    const reset = vi.fn(() => ({ jobId: 'J', setupToken: 'tok' }));
    const { dialog } = await open({ 'system.factoryReset': reset });
    const go = within(dialog).getByRole('button', { name: 'Reset hlabs' });
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Type hlabs to confirm'), { target: { value: 'hlabs' } });
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'secret' } });
    expect(go).toBeEnabled();
    for (const wrong of ['Hlabs', 'hlabs ', 'RESET']) {
      fireEvent.change(within(dialog).getByLabelText('Type hlabs to confirm'), { target: { value: wrong } });
      expect(go).toBeDisabled();
    }
    fireEvent.change(within(dialog).getByLabelText('Type hlabs to confirm'), { target: { value: 'hlabs' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: "Keep everyone's Home folders" }));
    fireEvent.click(go);
    await waitFor(() =>
      expect(reset).toHaveBeenCalledWith({ password: 'secret', confirmHostname: 'hlabs', keepHomeFolders: true }),
    );
    await waitFor(() => expect(restartingNow()).toMatchObject({ kind: 'resetting', setupToken: 'tok' }));
  });

  it('a wrong password says "That password isn\'t right" and nothing is reset', async () => {
    const { dialog } = await open({
      'system.factoryReset': () => {
        throw daemonError('AUTH_INVALID_PASSWORD');
      },
    });
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'wrong' } });
    fireEvent.change(within(dialog).getByLabelText('Type hlabs to confirm'), { target: { value: 'hlabs' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset hlabs' }));
    expect(await within(dialog).findByText("That password isn't right")).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Your password')).toHaveValue('');
    expect(restartingNow()).toBeNull();
  });

  it('no backup destination: no backups line; Cancel closes', async () => {
    const { dialog } = await open({ 'backups.destinations.list': () => ({ destinations: [] }) });
    await within(dialog).findByText('All 3 apps and their data are deleted');
    expect(within(dialog).queryByText(/Backups on/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
