import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { Profile } from './profile';

const account = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  locale: 'en',
  passwordChangedAt: null,
  totpEnabledAt: null,
  recoveryCodesUnused: 0,
  homeFolderBytes: null,
  adminName: 'Hari',
  ...over,
});

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-ACCT-03', () => {
  it('shows the avatar, the display name and "<username> · <role>"', async () => {
    const { container } = renderScreen(Profile, {
      'account.get': () => account({ role: 'member', avatarColor: 'mint' }),
    });
    expect(await screen.findByText('Hari')).toBeInTheDocument();
    expect(screen.getByText('hari · Member')).toBeInTheDocument();
    const avatar = container.querySelector('.hl-avatar')!;
    expect(avatar).toHaveTextContent('H');
    expect(avatar).toHaveAttribute('data-accent', 'mint');
  });

  it('Edit profile: name, colour and language; the username is read-only; saving closes, toasts and refreshes', async () => {
    let saved = account();
    const update = vi.fn((input: unknown) => {
      saved = { ...saved, ...(input as object) };
      return { ok: true };
    });
    renderScreen(Profile, { 'account.get': () => saved, 'account.update': update, 'auth.me': () => ({}) });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText('Language')).toHaveValue('en');
    fireEvent.change(within(dialog).getByLabelText('Display name'), { target: { value: '  Hari P  ' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Rose' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(update).toHaveBeenCalledWith({ displayName: 'Hari P', avatarColor: 'rose', locale: 'en' });
    expect(currentToasts().map((t) => t.title)).toEqual(['Profile updated']);
    expect(await screen.findByText('Hari P')).toBeInTheDocument();
  });

  it('an empty name disables Save and says "Enter a name"', async () => {
    renderScreen(Profile, { 'account.get': () => account() });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Display name'), { target: { value: '   ' } });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Display name')).toHaveAccessibleDescription('Enter a name');
  });

  it('a failed save keeps the dialog open with the edits and says what happened', async () => {
    renderScreen(Profile, {
      'account.get': () => account(),
      'account.update': () => Promise.reject(daemonError('VALIDATION_FAILED')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Display name'), { target: { value: 'Hari P' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't save your profile. Try again.");
    expect(within(dialog).getByLabelText('Display name')).toHaveValue('Hari P');
  });
});
