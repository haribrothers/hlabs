// US-APP-18 · Network access: "Reach the internet" (with the manifest's reason) and "Talk to other apps" ("Off keeps
// this app isolated from the rest") follow what's saved; Cancel puts switches and folders back; "Save and restart app"
// sends folders and network together, and says when the app didn't start so they were undone.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { appConfig, renderPermissions } from '../test/app-config';
import { oneEvent } from '../test/updates';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const network = () => screen.findByRole('group', { name: 'Network' });
const save = () => screen.getByRole('button', { name: /Save and restart app|Restarting…/ });
const folder = {
  target: '/mnt/hlabs/Backups',
  storageLocationId: 'nas',
  subpath: 'Backups',
  mode: 'rw' as const,
  place: { area: 'location' as const, locationName: 'NAS', path: 'Backups' },
  filesPath: '/drives/nas/Backups',
  available: true,
  folder: null,
};

describe('US-APP-18', () => {
  it("shows both switches as saved, with the manifest's reason", async () => {
    renderPermissions(
      {},
      appConfig({ network: { internet: true, apps: false, internetReason: 'Needed for website icons' } }),
    );
    const list = await network();
    expect(within(list).getByRole('switch', { name: 'Reach the internet' })).toHaveAttribute('aria-checked', 'true');
    expect(within(list).getByText('Needed for website icons · Off cuts your home network too')).toBeInTheDocument();
    expect(within(list).getByRole('switch', { name: 'Talk to other apps' })).toHaveAttribute('aria-checked', 'false');
    expect(within(list).getByText('Off keeps this app isolated from the rest')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('Cancel puts the switches and folders back', async () => {
    renderPermissions({}, appConfig({ folders: [folder] }));
    const list = await network();
    fireEvent.click(within(list).getByRole('switch', { name: 'Reach the internet' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Access to NAS › Backups' }));
    expect(save()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(list).getByRole('switch', { name: 'Reach the internet' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Access to NAS › Backups' })).toHaveAttribute('aria-checked', 'true');
    expect(save()).toBeDisabled();
  });

  it('saving sends folders and network together, then "Saved. <App> restarted."', async () => {
    const ev = oneEvent();
    const { calls } = renderPermissions(
      { 'apps.setPermissions': () => ({ jobId: 'j1' }), 'events.stream': ev.handler },
      appConfig({ folders: [folder] }),
    );
    const list = await network();
    fireEvent.click(within(list).getByRole('switch', { name: 'Reach the internet' }));
    fireEvent.click(within(list).getByRole('switch', { name: 'Talk to other apps' }));
    fireEvent.click(save());
    await waitFor(() => expect(calls.find((c) => c.path === 'apps.setPermissions')).toBeDefined());
    expect(calls.find((c) => c.path === 'apps.setPermissions')!.input).toEqual({
      appId: 'vaultwarden',
      mounts: [{ target: '/mnt/hlabs/Backups', storageLocationId: 'nas', subpath: 'Backups', mode: 'rw' }],
      network: { internet: false, apps: false },
    });
    expect(await screen.findByRole('button', { name: 'Restarting…' })).toBeDisabled();
    await ev.send('job.finished', {
      jobId: 'j1',
      kind: 'app_config',
      target: 'vaultwarden',
      state: 'succeeded',
      hlabsCode: null,
    });
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(expect.objectContaining({ title: 'Saved. Vaultwarden restarted.' })),
    );
  });

  it('when the app does not start, it says the changes were undone', async () => {
    const ev = oneEvent();
    renderPermissions({ 'apps.setPermissions': () => ({ jobId: 'j2' }), 'events.stream': ev.handler });
    const list = await network();
    fireEvent.click(within(list).getByRole('switch', { name: 'Reach the internet' }));
    fireEvent.click(save());
    await screen.findByRole('button', { name: 'Restarting…' });
    await ev.send('job.finished', {
      jobId: 'j2',
      kind: 'app_config',
      target: 'vaultwarden',
      state: 'failed',
      hlabsCode: 'APP_CONFIG_UNDONE',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Vaultwarden didn't start with the new settings, so they were undone.",
    );
  });
});
