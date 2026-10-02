import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { InviteDialog } from './invite-dialog';

const URL = 'https://hlabs.local/invite/abc';
const writeText = vi.fn(async () => undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

function renderDialog(onClose = vi.fn()) {
  const r = renderScreen(() => <InviteDialog onClose={onClose} />, {
    'invites.create': () => ({ inviteId: 'i1', url: URL, expiresAt: Date.now() + 7 * 86_400_000 }),
    'invites.update': () => ({ ok: true }),
    'invites.revoke': () => ({ ok: true }),
    'invites.list': () => ({ invites: [] }),
  });
  return { ...r, onClose };
}

const paths = (calls: Array<{ path: string; input: unknown }>, path: string) => calls.filter((c) => c.path === path);

describe('US-ACCT-21', () => {
  it('opening the dialog makes one Member invite with no apps and shows its link', async () => {
    const { calls } = renderDialog();
    expect(await screen.findByDisplayValue(URL)).toBeInTheDocument();
    expect(paths(calls, 'invites.create')).toEqual([{ path: 'invites.create', input: { role: 'member', appIds: [] } }]);
    expect(screen.getByText('Works once · expires in 7 days ·')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Invite someone' })).toBeInTheDocument();
  });

  it('saves their name once typing stops for 500 ms', async () => {
    const { calls } = renderDialog();
    await screen.findByDisplayValue(URL);
    const field = screen.getByLabelText('Their name (optional)');
    fireEvent.change(field, { target: { value: 'A' } });
    fireEvent.change(field, { target: { value: 'Anu' } });
    await new Promise((r) => setTimeout(r, 300));
    expect(paths(calls, 'invites.update')).toEqual([]);
    await waitFor(() =>
      expect(paths(calls, 'invites.update')).toEqual([
        { path: 'invites.update', input: { inviteId: 'i1', displayName: 'Anu' } },
      ]),
    );
  });

  it('Copy puts the link on the clipboard and says "Copied" for 2 seconds', async () => {
    renderDialog();
    await screen.findByDisplayValue(URL);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(URL);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument(), { timeout: 3_000 });
  });

  it('Close without copying revokes the invite', async () => {
    const { calls, onClose } = renderDialog();
    await screen.findByDisplayValue(URL);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(paths(calls, 'invites.revoke')).toEqual([{ path: 'invites.revoke', input: { inviteId: 'i1' } }]),
    );
  });

  it('Close after copying keeps the invite, and so does Done', async () => {
    const copiedThenClosed = renderDialog();
    await screen.findByDisplayValue(URL);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('button', { name: 'Copied' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(copiedThenClosed.onClose).toHaveBeenCalled();
    copiedThenClosed.unmount();

    const done = renderDialog();
    await screen.findByDisplayValue(URL);
    fireEvent.change(screen.getByLabelText('Their name (optional)'), { target: { value: 'Anu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    // Done saves a name typed just before, without waiting.
    await waitFor(() => expect(done.onClose).toHaveBeenCalled());
    expect(paths(done.calls, 'invites.update').at(-1)?.input).toEqual({ inviteId: 'i1', displayName: 'Anu' });
    expect(paths([...copiedThenClosed.calls, ...done.calls], 'invites.revoke')).toEqual([]);
  });
});
