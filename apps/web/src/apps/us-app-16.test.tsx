// US-APP-16 · Save configuration and restart: "Save and restart app" waits for a change; Cancel puts the saved values
// back; saving shows "Restarting…" and then "Saved. <App> restarted.", or that the new settings were undone; switching
// tabs or closing with unsaved changes asks "Discard changes?".
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { appConfig, renderConfig, vaultwarden } from '../test/app-config';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { oneEvent } from '../test/updates';
import { AppSettings } from './app-settings';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 7) => shared.isFeatureEnabled(f, p) };
});

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const save = () => screen.getByRole('button', { name: /Save and restart app|Restarting…/ });
const workers = () => screen.getByRole('textbox', { name: 'Value of WEB_WORKERS' });

describe('US-APP-16', () => {
  it('with nothing changed, "Save and restart app" and Cancel wait', async () => {
    renderConfig();
    await screen.findByRole('group', { name: 'Environment variables' });
    expect(save()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('Cancel puts every field back to its saved value', async () => {
    renderConfig();
    await screen.findByRole('group', { name: 'Environment variables' });
    fireEvent.change(workers(), { target: { value: '9' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Subdomain' }), { target: { value: 'vault' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }));
    // An empty new row isn't ready to save, but Cancel can put everything back.
    expect(save()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(workers()).toHaveValue('4');
    expect(screen.getByRole('textbox', { name: 'Subdomain' })).toHaveValue('vaultwarden');
    expect(screen.queryByRole('textbox', { name: 'Name of the new variable' })).toBeNull();
    expect(save()).toBeDisabled();
  });

  it('saving says "Restarting…", then "Saved. <App> restarted."', async () => {
    const ev = oneEvent();
    renderConfig({ 'apps.setConfig': () => ({ jobId: 'j1' }), 'events.stream': ev.handler });
    await screen.findByRole('group', { name: 'Environment variables' });
    fireEvent.change(workers(), { target: { value: '6' } });
    fireEvent.click(save());
    expect(await screen.findByRole('button', { name: 'Restarting…' })).toBeDisabled();
    await ev.send('job.finished', {
      jobId: 'j1',
      kind: 'app_config',
      target: 'vaultwarden',
      state: 'succeeded',
      hlabsCode: null,
    });
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(
        expect.objectContaining({ tone: 'success', title: 'Saved. Vaultwarden restarted.' }),
      ),
    );
  });

  it("when the app didn't start, it says the settings were undone", async () => {
    const ev = oneEvent();
    renderConfig({ 'apps.setConfig': () => ({ jobId: 'j2' }), 'events.stream': ev.handler });
    await screen.findByRole('group', { name: 'Environment variables' });
    fireEvent.change(workers(), { target: { value: '99' } });
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
    // What was typed stays, to fix and try again.
    expect(workers()).toHaveValue('99');
    expect(save()).toBeEnabled();
  });

  describe('Discard changes?', () => {
    const open = () => {
      const app = vaultwarden();
      return renderScreen(
        () => <AppSettings appId="vaultwarden" />,
        {
          'apps.get': () => app,
          'apps.getConfig': () => appConfig(),
          'apps.widgetKey': () => ({ needed: false, set: false, help: null }),
          'jobs.list': () => ({ items: [] }),
          'events.stream': () => new Promise(() => {}),
          'auth.me': fakeMe({ role: 'admin' }),
        },
        { path: '/apps/vaultwarden/settings' },
      );
    };

    it('switching tabs with unsaved changes asks; Keep editing stays, Discard switches', async () => {
      open();
      const tabs = await screen.findByRole('tablist', { name: 'App sections' });
      fireEvent.click(within(tabs).getByRole('tab', { name: 'Configuration' }));
      fireEvent.change(await screen.findByRole('textbox', { name: 'Value of WEB_WORKERS' }), {
        target: { value: '7' },
      });
      fireEvent.click(within(tabs).getByRole('tab', { name: 'Permissions' }));
      const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull());
      expect(within(tabs).getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('textbox', { name: 'Value of WEB_WORKERS' })).toHaveValue('7');

      fireEvent.click(within(tabs).getByRole('tab', { name: 'Permissions' }));
      fireEvent.click(
        within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
          name: 'Discard',
        }),
      );
      await waitFor(() =>
        expect(within(tabs).getByRole('tab', { name: 'Permissions' })).toHaveAttribute('aria-selected', 'true'),
      );
    });

    it('closing with unsaved changes asks too; without changes it just closes', async () => {
      open();
      const tabs = await screen.findByRole('tablist', { name: 'App sections' });
      fireEvent.click(within(tabs).getByRole('tab', { name: 'Configuration' }));
      fireEvent.change(await screen.findByRole('textbox', { name: 'Value of WEB_WORKERS' }), {
        target: { value: '7' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    });
  });
});
