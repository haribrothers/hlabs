import { describe, expect, it } from 'vitest';
import { captureSetupToken, readSetupToken, SETUP_HEADER, setupHeaders } from '../lib/setup-token';
import { firstRunView } from './first-run';

function fakeWindow(href: string) {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
  const env = {
    location: { href } as Location,
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, url: string) {
        env.location = { href: new URL(url, href).href } as Location;
      },
    } as unknown as History,
    sessionStorage,
  };
  return env;
}

describe('US-ONB-01', () => {
  describe('setup token from the setup URL', () => {
    it('keeps the token in sessionStorage and strips it from the address bar', () => {
      const env = fakeWindow('http://127.0.0.1:5173/setup?token=abc_DEF-123');
      captureSetupToken(env);
      expect(readSetupToken(env.sessionStorage)).toBe('abc_DEF-123');
      expect(env.location.href).toBe('http://127.0.0.1:5173/setup');
    });

    it('ignores a token anywhere but /setup', () => {
      const env = fakeWindow('http://127.0.0.1:5173/files?token=abc');
      captureSetupToken(env);
      expect(readSetupToken(env.sessionStorage)).toBeNull();
      expect(env.location.href).toContain('token=abc');
    });

    it('sends the token only with onboarding calls', () => {
      expect(setupHeaders(['onboarding.checkSystem'], 'tok')).toEqual({ [SETUP_HEADER]: 'tok' });
      expect(setupHeaders(['system.info', 'onboarding.status'], 'tok')).toEqual({ [SETUP_HEADER]: 'tok' });
      expect(setupHeaders(['system.info'], 'tok')).toEqual({});
      expect(setupHeaders(['onboarding.checkSystem'], null)).toEqual({});
    });
  });

  describe('what the dashboard shows before onboarding is complete', () => {
    const base = { failed: false, dev: false };
    const incomplete = { completed: false, step: 'welcome' as const };

    it('opens onboarding in the browser that has the setup token', () => {
      expect(firstRunView({ ...base, pathname: '/', status: incomplete, hasSetupToken: true })).toEqual({
        kind: 'redirect',
        to: '/setup',
      });
      expect(firstRunView({ ...base, pathname: '/setup', status: incomplete, hasSetupToken: true })).toEqual({
        kind: 'setup',
      });
    });

    it('tells other devices to finish setup on the computer running hlabs, on every page', () => {
      for (const pathname of ['/', '/setup', '/settings']) {
        expect(firstRunView({ ...base, pathname, status: incomplete, hasSetupToken: false })).toEqual({
          kind: 'elsewhere',
        });
      }
    });

    it('shows the dashboard once onboarding is complete, and leaves /setup', () => {
      const completed = { completed: true, step: 'done' as const };
      expect(firstRunView({ ...base, pathname: '/', status: completed, hasSetupToken: true })).toEqual({ kind: 'app' });
      expect(firstRunView({ ...base, pathname: '/setup', status: completed, hasSetupToken: false })).toEqual({
        kind: 'redirect',
        to: '/',
      });
    });

    it('waits for the status, and leaves daemon errors to the system states', () => {
      expect(firstRunView({ ...base, pathname: '/', status: undefined, hasSetupToken: false })).toEqual({
        kind: 'loading',
      });
      expect(firstRunView({ ...base, failed: true, pathname: '/', status: undefined, hasSetupToken: false })).toEqual({
        kind: 'app',
      });
    });

    it('keeps development pages reachable in development only', () => {
      const opts = { ...base, pathname: '/dev/ui', status: incomplete, hasSetupToken: false };
      expect(firstRunView({ ...opts, dev: true })).toEqual({ kind: 'app' });
      expect(firstRunView(opts)).toEqual({ kind: 'elsewhere' });
    });
  });
});
