import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { SectionPage } from './section-page';
import { sectionAccess, visibleSections } from './sections';
import { SettingsLayout } from './settings-layout';

const labels = (role: 'admin' | 'member', phase: number) => visibleSections(role, phase).map((s) => s.label);

describe('US-ACCT-01', () => {
  it('admins get every section in order; members Account, Appearance, Notifications, About', () => {
    expect(labels('admin', 9)).toEqual([
      'Account',
      'Users',
      'Appearance',
      'Notifications',
      'Network & remote access',
      'Storage',
      'Engine & startup',
      'Backups',
      'Updates',
      'Advanced',
      'About',
    ]);
    expect(labels('member', 9)).toEqual(['Account', 'Appearance', 'Notifications', 'About']);
  });

  it('sections wait for their phase', () => {
    expect(labels('admin', 1)).toEqual(['Account', 'Engine & startup']);
    expect(labels('admin', 3)).toEqual(['Account', 'Users', 'Network & remote access', 'Engine & startup']);
    expect(labels('member', 1)).toEqual(['Account']);
  });

  it('an admin-only URL is "no access" for a member; unknown or unshipped sections are not found', () => {
    expect(sectionAccess('engine', 'member', 1)).toEqual({ kind: 'denied' });
    expect(sectionAccess('engine', 'admin', 1)).toMatchObject({ kind: 'ok' });
    expect(sectionAccess('nope', 'admin', 9)).toEqual({ kind: 'notFound' });
    expect(sectionAccess('users', 'admin', 1)).toEqual({ kind: 'notFound' });
  });

  it('a member at /settings/engine sees "You don\'t have access to this" at the same URL, and nothing admin is asked for', async () => {
    const { calls, router } = renderScreen(
      () => <SectionPage id="engine" />,
      { 'auth.me': fakeMe({ role: 'member' }) },
      {
        path: '/settings/engine',
      },
    );
    expect(await screen.findByRole('heading', { level: 1, name: "You don't have access to this" })).toBeInTheDocument();
    expect(screen.getByText('Ask an admin if you need it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('No access · hlabs');
    expect(router.state.location.pathname).toBe('/settings/engine');
    expect(new Set(calls.map((c) => c.path))).toEqual(new Set(['auth.me']));
  });

  it('the sidebar follows the role, and updates when auth.me is refetched on focus', async () => {
    let role = 'admin';
    renderScreen(SettingsLayout, { 'auth.me': () => fakeMe({ role })() }, { path: '/settings/account' });
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(nav).toHaveTextContent('Engine & startup');
    role = 'member';
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(nav).not.toHaveTextContent('Engine & startup'));
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Account']);
  });
});
