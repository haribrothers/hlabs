// US-INST-21 · Choose what to keep when uninstalling: the window (TrayUninstall) says how many apps stop, offers
// "Keep my data" (chosen) and "Delete everything" with the size, "Also remove Colima" only for hlabs's own Colima, the
// note about backups and dragging to the Trash; Uninstall turns destructive with Delete everything.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { runningItems } from '../src/menu';
import { tilde, Uninstall } from '../src/uninstall';
import { actions } from './uninstall-actions';

describe('US-INST-21 · Choose what to keep when uninstalling', () => {
  it('says how many apps stop, and keeping the data is chosen', async () => {
    render(<Uninstall actions={actions()} />);
    expect(screen.getByRole('heading', { name: 'Uninstall hlabs?' })).toBeInTheDocument();
    expect(await screen.findByText('All 11 apps stop and hlabs is removed from this Mac.')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'What to keep' });
    expect(group).toHaveTextContent('App data and Home folders stay in ~/hlabs, so you can reinstall later');
    expect(group).toHaveTextContent("Removes 97 GB. This can't be undone.");
    expect(screen.getByRole('radio', { name: /Keep my data/ })).toBeChecked();
    expect(
      screen.getByText(
        "Backups on your NAS aren't touched. Dragging hlabs to the Trash on its own would leave apps running in the background, so use this instead.",
      ),
    ).toBeInTheDocument();
  });

  it('offers removing Colima only when hlabs installed it, unticked', async () => {
    const { unmount } = render(<Uninstall actions={actions()} />);
    expect(
      await screen.findByRole('checkbox', { name: 'Also remove Colima, which hlabs installed' }),
    ).not.toBeChecked();
    unmount();
    render(<Uninstall actions={actions({}, { colimaManaged: false, appCount: 1 })} />);
    expect(await screen.findByText('Your app stops and hlabs is removed from this Mac.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('Uninstall turns destructive with Delete everything; Cancel and Esc close the window', async () => {
    const a = actions();
    render(<Uninstall actions={a} />);
    await screen.findByText(/All 11 apps stop/);
    const uninstall = screen.getByRole('button', { name: 'Uninstall' });
    expect(uninstall).not.toHaveClass('hl-btn-destructive');
    await userEvent.click(screen.getByRole('radio', { name: /Delete everything/ }));
    expect(uninstall).toHaveClass('hl-btn-destructive');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(a.close).toHaveBeenCalledTimes(2);
  });

  it('without a size in time, or with no apps, it still says what goes', async () => {
    render(<Uninstall actions={actions({}, { dataBytes: null, appCount: 0 })} />);
    expect(await screen.findByText('hlabs is removed from this Mac.')).toBeInTheDocument();
    expect(screen.getByText("Removes everything in ~/hlabs. This can't be undone.")).toBeInTheDocument();
    expect(tilde('/home/hari/hlabs')).toBe('~/hlabs');
    expect(tilde('/Volumes/Data/hlabs')).toBe('/Volumes/Data/hlabs');
  });

  it('is in the menu once phase 6 ships', () => {
    expect(runningItems({}, 6).some((i) => 'label' in i && i.label === 'Uninstall hlabs…')).toBe(true);
    expect(runningItems({}, 5).some((i) => 'label' in i && i.label === 'Uninstall hlabs…')).toBe(false);
  });
});
