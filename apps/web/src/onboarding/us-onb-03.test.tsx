import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { firstRunView } from './first-run';
import { StepFrame } from './step-frame';
import { resumePath, stepPath } from './steps';

describe('US-ONB-03', () => {
  describe('where to resume', () => {
    const at = (pathname: string, saved: Parameters<typeof resumePath>[0]['saved'], entry = false) =>
      resumePath({ pathname, saved, entry, shippedPhase: 1 });

    it('opening setup again goes straight to the saved step', () => {
      expect(at('/setup', 'storage', true)).toBe('/setup/storage');
      expect(at('/setup', 'welcome', true)).toBeNull();
    });

    it('a step later than the saved one goes back to the saved step', () => {
      expect(at('/setup/storage', 'system')).toBe('/setup/system');
      expect(at('/setup/done', 'account')).toBe('/setup/account');
    });

    it('earlier steps stay reachable with Back', () => {
      expect(at('/setup/system', 'storage')).toBeNull();
      expect(at('/setup', 'storage')).toBeNull();
    });

    it('unknown and not-yet-shipped steps go to the saved step', () => {
      expect(at('/setup/nope', 'account')).toBe('/setup/account');
      expect(at('/setup/welcome', 'account')).toBe('/setup/account');
      // Remote access ships in phase 3 (D-041).
      expect(at('/setup/remote', 'storage')).toBe('/setup/storage');
      expect(resumePath({ pathname: '/setup/remote', saved: 'remote', entry: true, shippedPhase: 3 })).toBeNull();
    });

    it('the dashboard sends an unfinished setup to the saved step', () => {
      const status = { completed: false, step: 'storage' as const };
      const base = { failed: false, dev: false, hasSetupToken: true, shippedPhase: 1 };
      expect(firstRunView({ ...base, pathname: '/', status })).toEqual({ kind: 'redirect', to: '/setup/storage' });
      expect(firstRunView({ ...base, pathname: '/setup', status, entry: true })).toEqual({
        kind: 'redirect',
        to: stepPath('storage'),
      });
      expect(firstRunView({ ...base, pathname: '/setup/storage', status, entry: true })).toEqual({ kind: 'setup' });
    });

    it('once an admin exists, a signed-out browser logs in first and comes back to the saved step', () => {
      const status = { completed: false, step: 'storage' as const, hasUsers: true };
      const base = { failed: false, dev: false, shippedPhase: 1, entry: true, status };
      // With or without the setup token: after the admin exists only the session counts.
      for (const hasSetupToken of [true, false]) {
        expect(firstRunView({ ...base, hasSetupToken, pathname: '/setup', session: 'none' })).toEqual({
          kind: 'redirect',
          to: '/login',
          search: { next: '/setup/storage' },
        });
      }
      expect(firstRunView({ ...base, hasSetupToken: false, pathname: '/login/users', session: 'none' })).toEqual({
        kind: 'plain',
      });
      expect(firstRunView({ ...base, hasSetupToken: false, pathname: '/setup', session: 'pending' })).toEqual({
        kind: 'loading',
      });
      // Signed in (even in a browser without the token): straight to the saved step.
      expect(firstRunView({ ...base, hasSetupToken: false, pathname: '/setup/storage', session: 'ok' })).toEqual({
        kind: 'setup',
      });
    });

    it('finished onboarding sends every setup route home', () => {
      const status = { completed: true, step: 'done' as const };
      for (const pathname of ['/setup', '/setup/system', '/setup/done']) {
        expect(firstRunView({ pathname, status, failed: false, dev: false, hasSetupToken: true, entry: true })).toEqual(
          {
            kind: 'redirect',
            to: '/',
          },
        );
      }
    });
  });

  describe('the step frame', () => {
    it('reads "Step N of M" over the enabled steps and names it as setup progress', () => {
      render(<StepFrame step="storage" title="Where should your data live?" />);
      const progress = screen.getByRole('navigation', { name: 'Setup progress' });
      // Phase 2 counts five: system, account, two-factor, storage, starter apps (D-041; remote access is phase 3).
      expect(progress).toHaveTextContent(/^Step 4 of 5/);
      expect(progress).not.toHaveTextContent('Step 4 of 5 ·');
      expect(screen.getAllByRole('listitem')[3]).toHaveAttribute('aria-current', 'step');
    });

    it('moves focus to the new step heading', () => {
      const { rerender } = render(<StepFrame key="system" step="system" title="Checking this computer" />);
      expect(screen.getByRole('heading', { level: 1, name: 'Checking this computer' })).toHaveFocus();
      rerender(<StepFrame key="account" step="account" title="Create your admin account" />);
      expect(screen.getByRole('heading', { level: 1, name: 'Create your admin account' })).toHaveFocus();
    });
  });
});
