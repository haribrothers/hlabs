import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { AccountStep } from './account-step';

describe('US-ONB-10', () => {
  it('a stale tab says an admin already exists and offers Log in', async () => {
    const createAdmin = vi.fn(() => Promise.reject(daemonError('ONBOARDING_USERS_EXIST')));
    renderScreen(AccountStep, { 'onboarding.createAdmin': createAdmin });
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Hari' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An admin account already exists. Log in to continue.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText("Couldn't create the account. Try again.")).toBeNull();
  });
});
