// US-HOME-19 · Add a widget from the picker: "Add a widget" with System and From your apps, a preview and Add or Added
// for each, added widgets at the end of the row, and "Home is full" at four.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { homeAt7 } from '../test/home-edit';

const catalog = () => ({
  system: [
    { id: 'live-usage', name: 'Live usage' },
    { id: 'storage', name: 'Storage' },
    { id: 'app-status', name: 'App status' },
    { id: 'updates', name: 'Updates' },
  ],
  apps: [
    {
      id: 'app:kuma:monitors',
      appId: 'kuma',
      appName: 'Uptime Kuma',
      name: 'Monitors',
      template: 'twoStat',
      needsKey: false,
      hasKey: false,
    },
  ],
});

async function openPicker(widgets: string[]) {
  const r = homeAt7(
    {
      'home.listWidgets': catalog,
      'home.getWidgetData': (input) =>
        Object.fromEntries(
          (input as { widgetIds: string[] }).widgetIds.map((id) => [
            id,
            id === 'app-status'
              ? { status: 'ok', data: { running: 11, stopped: 1, attention: 0 }, updatedAt: 1 }
              : id === 'updates'
                ? { status: 'ok', data: { count: 2 }, updatedAt: 1 }
                : {
                    status: 'ok',
                    data: {
                      template: 'twoStat',
                      first: { value: 12, label: 'up' },
                      second: { value: 0, label: 'down' },
                    },
                    updatedAt: 1,
                  },
          ]),
        ),
    },
    { widgets },
  );
  const t = await screen.findByRole('button', { name: 'Open Jellyfin' });
  fireEvent.contextMenu(t.closest('li')!.firstElementChild!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Home' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add a widget' });
  return { ...r, dialog };
}

describe('US-HOME-19', () => {
  it('opens "Add a widget" with System and From your apps, each with a preview and Add or Added', async () => {
    const { dialog } = await openPicker(['storage']);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const system = within(dialog).getByRole('region', { name: 'System' });
    await within(system).findByText('11');
    expect(within(system).getByText('2 app updates')).toBeInTheDocument();
    expect(within(system).getByRole('button', { name: 'Added' })).toBeDisabled();
    expect(within(system).getByRole('button', { name: 'Add App status' })).toBeEnabled();
    const apps = within(dialog).getByRole('region', { name: 'From your apps' });
    expect(within(apps).getByText('Monitors')).toBeInTheDocument();
    expect(await within(apps).findByText('12')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Apps can offer widgets through their manifest. Up to 4 widgets fit on Home.');
  });

  it('Add turns into Added and the widget joins the end of the row, saved with Done', async () => {
    const { dialog, saved } = await openPicker(['storage']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add App status' }));
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: 'Added' })).toHaveLength(2));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.items.filter((i) => i.kind === 'widget').map((i) => i.id)).toEqual(['storage', 'app-status']);
  });

  it('with four widgets every Add is off and Home says it’s full', async () => {
    const { dialog } = await openPicker(['storage', 'live-usage', 'app-status', 'updates']);
    expect(within(dialog).getByText('Home is full. Remove a widget to add another.')).toBeInTheDocument();
    const adds = within(dialog).queryAllByRole('button', { name: /^Add / });
    expect(adds.length).toBeGreaterThan(0);
    for (const b of adds) expect(b).toBeDisabled();
  });
});
