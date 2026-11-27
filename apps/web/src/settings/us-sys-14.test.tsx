// US-SYS-14 · Empty everyone's trash: "Trash" says it's emptied after 30 days and how big it is; "Empty now" asks
// "Empty trash for everyone?" and then deletes every person's trash, with a toast of the space freed; disabled when
// the trash is empty.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderStorage, SUMMARY } from '../test/storage';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-14', () => {
  it('"Empty now" confirms "Empty trash for everyone?", empties every person\'s trash and says what it freed', async () => {
    let summary = SUMMARY;
    const empty = vi.fn(() => {
      summary = { ...SUMMARY, trashBytes: 0, trashCount: 0 };
      return { ok: true };
    });
    renderStorage({ 'storage.summary': () => summary, 'files.emptyTrash': empty as never });
    const clean = await screen.findByRole('group', { name: 'Clean up' });
    expect(
      await within(clean).findByText('Emptied automatically after 30 days · 1.2 GB in the trash'),
    ).toBeInTheDocument();
    fireEvent.click(within(clean).getByRole('button', { name: 'Empty now' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Empty trash for everyone?' });
    expect(dialog).toHaveTextContent("Everything in everyone's trash (1.2 GB) is deleted for good.");
    fireEvent.click(within(dialog).getByRole('button', { name: 'Empty trash' }));
    await waitFor(() => expect(empty).toHaveBeenCalledWith({ allUsers: true }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Freed 1.2 GB'));
    await waitFor(() => expect(within(clean).getByRole('button', { name: 'Empty now' })).toBeDisabled());
  });

  it('Cancel leaves the trash as it is', async () => {
    const empty = vi.fn();
    renderStorage({ 'files.emptyTrash': empty as never });
    const clean = await screen.findByRole('group', { name: 'Clean up' });
    fireEvent.click(await within(clean).findByRole('button', { name: 'Empty now' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Empty trash for everyone?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(empty).not.toHaveBeenCalled();
  });

  it('"Empty now" is disabled while the trash is empty', async () => {
    renderStorage({ 'storage.summary': () => ({ ...SUMMARY, trashBytes: 0, trashCount: 0 }) });
    const clean = await screen.findByRole('group', { name: 'Clean up' });
    await waitFor(() => expect(within(clean).getByRole('button', { name: 'Empty now' })).toBeDisabled());
    expect(within(clean).getByText('Emptied automatically after 30 days')).toBeInTheDocument();
  });
});
