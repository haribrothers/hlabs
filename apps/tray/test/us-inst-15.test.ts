// US-INST-15 · Tray authenticates to the daemon with a local token: the window's side of the calls.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { daemon, DaemonCallError } from '../src/daemon';

describe('US-INST-15 · Tray authenticates to the daemon with a local token', () => {
  beforeEach(() => invoke.mockReset());

  it('calls tray procedures through the Rust side, which holds the token', async () => {
    invoke.mockResolvedValueOnce('http://127.0.0.1:7474/setup?token=x');
    await expect(daemon.query('setupUrl')).resolves.toBe('http://127.0.0.1:7474/setup?token=x');
    expect(invoke).toHaveBeenCalledWith('daemon_call', { kind: 'query', path: 'tray.setupUrl', input: null });

    invoke.mockResolvedValueOnce({ ok: true });
    await daemon.mutate('setStartAtLogin', { enabled: false });
    expect(invoke).toHaveBeenLastCalledWith('daemon_call', {
      kind: 'mutation',
      path: 'tray.setStartAtLogin',
      input: { enabled: false },
    });
    // The token is never part of what the window sends.
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/bearer|token"/i);
  });

  it('reports a rejected token and an unreachable daemon as typed failures', async () => {
    invoke.mockRejectedValueOnce({ kind: 'tokenRejected' });
    await expect(daemon.query('status')).rejects.toMatchObject({ failure: { kind: 'tokenRejected' } });
    invoke.mockRejectedValueOnce({ kind: 'api', hlabsCode: 'ACCESS_DENIED', status: 403 });
    const err = await daemon.query('status').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DaemonCallError);
    expect((err as DaemonCallError).failure).toEqual({ kind: 'api', hlabsCode: 'ACCESS_DENIED', status: 403 });
    invoke.mockRejectedValueOnce('something odd');
    await expect(daemon.query('status')).rejects.toMatchObject({ failure: { kind: 'protocol' } });
  });
});
