// US-APP-11 · Confirm uninstall and choose what happens to data.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});

function open(over: Partial<Parameters<typeof appDetail>[0]> = {}, handlers: Handlers = {}) {
  const app = appDetail({
    id: 'vaultwarden',
    name: 'Vaultwarden',
    state: 'running',
    disk: { dataBytes: 210_000_000, imageBytes: 90_000_000 },
    ...over,
  });
  return renderScreen(
    () => <AppSettings appId="vaultwarden" />,
    { 'apps.get': () => app, 'events.stream': never, 'auth.me': fakeMe({ role: 'admin' }), ...handlers },
    { path: '/apps/vaultwarden/settings' },
  );
}

async function openDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Uninstall…' }));
  return screen.findByRole('alertdialog', { name: 'Uninstall Vaultwarden?' });
}

describe('US-APP-11', () => {
  it('"Uninstall…" opens "Uninstall <App>?" saying what happens, with "Keep its data" chosen', async () => {
    open();
    const dialog = await openDialog();
    expect(within(dialog).getByText('The app stops and is removed from your Home screen.')).toBeInTheDocument();
    const choices = within(dialog).getByRole('radiogroup', { name: 'What happens to its data' });
    expect(within(choices).getByRole('radio', { name: /Keep its data/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(choices).getByText('Reinstalling later picks up where you left off.')).toBeInTheDocument();
    expect(within(choices).getByText("Removes 210 MB. This can't be undone.")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Uninstall' })).toBeEnabled();
  });

  it('"Delete its data too" turns the button into "Uninstall and delete data"', async () => {
    open();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Delete its data too/ }));
    const confirm = within(dialog).getByRole('button', { name: 'Uninstall and delete data' });
    expect(confirm).toHaveClass('hl-btn-destructive');
  });

  it('focus starts on Cancel; Cancel and Esc change nothing', async () => {
    const { calls } = open();
    let dialog = await openDialog();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    dialog = await openDialog();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls.some((c) => c.path === 'apps.uninstall')).toBe(false);
  });

  it('an app another app needs says "<Other> needs <App>. Uninstall it first." and can\'t be confirmed', async () => {
    open({ dependents: ['Immich'] });
    const dialog = await openDialog();
    expect(within(dialog).getByText('Immich needs Vaultwarden. Uninstall it first.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Uninstall' })).toBeDisabled();
  });

  it('confirming sends keepData, and a refusal from the daemon shows in the dialog', async () => {
    const { calls } = open({}, { 'apps.uninstall': () => Promise.reject(daemonError('APP_HAS_DEPENDENTS')) });
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Delete its data too/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Uninstall and delete data' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ path: 'apps.uninstall', input: { appId: 'vaultwarden', keepData: false } }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Other apps need this one');
  });
});
