import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { passwordStrength, suggestUsername } from './account-form';
import { AccountStep } from './account-step';

describe('US-ONB-08', () => {
  it('suggests the lowercased first word of the name as the username', () => {
    expect(suggestUsername('Hari Prasad')).toBe('hari');
    expect(suggestUsername('  José  Martín')).toBe('jose');
    expect(suggestUsername("O'Brien")).toBe('obrien');
    expect(suggestUsername('')).toBe('');
  });

  it('reads "Strong · at least 12 characters" for 12+ characters not on the common list', () => {
    expect(passwordStrength('')).toMatchObject({ level: 'empty' });
    expect(passwordStrength('short')).toMatchObject({ level: 'weak', text: 'Weak · use at least 12 characters' });
    expect(passwordStrength('q1w2e3r4t5y6')).toMatchObject({ level: 'common', text: 'This password is too common' });
    expect(passwordStrength('correct horse')).toMatchObject({
      level: 'strong',
      bars: 3,
      text: 'Strong · at least 12 characters',
    });
    expect(passwordStrength('correct horse battery').bars).toBe(4);
  });

  it('shows the fields with the right autocomplete, suggesting the username until it is edited', async () => {
    renderScreen(AccountStep, {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Create your admin account' })).toBeInTheDocument();
    expect(
      screen.getByText('The admin manages apps, users and settings. You can add family members later.'),
    ).toBeInTheDocument();
    const name = screen.getByLabelText('Your name');
    const username = screen.getByLabelText('Username');
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('autocomplete', 'new-password');

    fireEvent.change(name, { target: { value: 'Hari Prasad' } });
    expect(username).toHaveValue('hari');
    fireEvent.change(username, { target: { value: 'hp' } });
    fireEvent.change(name, { target: { value: 'Hari' } });
    expect(username).toHaveValue('hp');
  });

  it('updates the strength hint as you type, and each password field can be shown', async () => {
    renderScreen(AccountStep, {});
    const password = await screen.findByLabelText('Password');
    fireEvent.change(password, { target: { value: 'correct horse' } });
    expect(screen.getByText('Strong · at least 12 characters')).toBeInTheDocument();
    const [showPassword, showConfirm] = screen.getAllByRole('button', { name: 'Show password' });
    fireEvent.click(showPassword!);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password');
    fireEvent.click(showConfirm!);
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'text');
  });

  it('Create account (or Enter) creates the admin, picks up the session and opens two-factor', async () => {
    let finish!: () => void;
    const createAdmin = vi.fn(() => new Promise((r) => (finish = () => r({ userId: 'u1' }))));
    const me = vi.fn(() => ({ id: 'u1', csrfToken: 'csrf1' }));
    const { router, calls } = renderScreen(AccountStep, {
      'onboarding.createAdmin': createAdmin,
      'auth.me': me,
      'onboarding.status': () => ({ completed: false, step: 'twoFactor', hasUsers: true }),
    });
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Hari Prasad' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery' } });
    // Enter in the last field submits the form.
    fireEvent.submit(screen.getByLabelText('Confirm password').closest('form')!);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled());
    expect(createAdmin).toHaveBeenCalledWith({
      displayName: 'Hari Prasad',
      username: 'hari',
      password: 'correct horse battery',
    });
    finish();
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/twoFactor'));
    expect(me).toHaveBeenCalled();
    expect(calls.map((c) => c.path)).toContain('auth.me');
  });

  it('Back opens the system check', async () => {
    const { router } = renderScreen(AccountStep, {});
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/system'));
  });
});
