import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { SettingsLayout } from './settings-layout';

describe('US-ACCT-02', () => {
  it('Up and Down move between sections; the open one is marked current', async () => {
    renderScreen(SettingsLayout, { 'auth.me': fakeMe() }, { path: '/settings/account' });
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' });
    const account = screen.getByRole('link', { name: 'Account' });
    const engine = screen.getByRole('link', { name: 'Engine & startup' });
    expect(account).toHaveAttribute('aria-current', 'page');
    account.focus();
    fireEvent.keyDown(nav, { key: 'ArrowDown' });
    expect(engine).toHaveFocus();
    fireEvent.keyDown(nav, { key: 'ArrowUp' });
    expect(account).toHaveFocus();
  });

  it('Escape closes Settings and goes Home, but not while a dialog is open', async () => {
    const { router } = renderScreen(SettingsLayout, { 'auth.me': fakeMe() }, { path: '/settings/account' });
    await screen.findByRole('navigation', { name: 'Settings sections' });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(router.state.location.pathname).toBe('/settings/account');
    dialog.remove();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
