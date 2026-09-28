import { describe, expect, it } from 'vitest';
import { firstRunView } from './first-run';

const done = { completed: true, step: 'done' as const };
const view = (pathname: string, mustSetupTotp: boolean) =>
  firstRunView({ pathname, status: done, failed: false, hasSetupToken: false, dev: false, mustSetupTotp });

describe('US-AUTH-10', () => {
  it('every route but two-factor setup and the log-in screens goes to setup, keeping where it was going', () => {
    expect(view('/files', true)).toEqual({
      kind: 'redirect',
      to: '/settings/account/two-factor',
      search: { next: '/files' },
    });
    expect(view('/', true)).toEqual({ kind: 'redirect', to: '/settings/account/two-factor' });
    expect(view('/settings/account/two-factor', true)).toEqual({ kind: 'app' });
    expect(view('/login/users', true)).toEqual({ kind: 'plain' });
  });

  it('nothing changes when two-factor is not required or already set up', () => {
    expect(view('/files', false)).toEqual({ kind: 'app' });
  });
});
