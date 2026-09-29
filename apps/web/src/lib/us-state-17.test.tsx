import { HLABS_CODES } from '@hlabs/api';
import { TRPCClientError } from '@trpc/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daemonError } from '../test/render';
import { errorLine, errorText, showErrorToast } from './error-copy';
import { currentToasts, dismissToast } from './toasts';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
  vi.restoreAllMocks();
});

const RAW = 'Error: bind: address already in use at /var/lib/docker/containers/3f9a1c2b4d5e/hostconfig.json:12';
const withRaw = (code: string, detail: Record<string, unknown> | null = null) => {
  const err = daemonError(code, detail);
  err.message = RAW;
  return err;
};

describe('US-STATE-17', () => {
  it('every code in the catalogue has a title and body, with no gaps or raw text even without details', () => {
    for (const code of HLABS_CODES) {
      const { title, body } = errorText(withRaw(code));
      expect(title, code).toMatch(/\S/);
      expect(body, code).toMatch(/\S/);
      for (const text of [title, body]) {
        expect(text, code).not.toMatch(/undefined|null|NaN|\/var\/|3f9a1c2b|Error:/);
      }
    }
  });

  it('fills values from the details: "<App> couldn\'t start" / "Port <port> is already in use by another program."', () => {
    expect(errorText(daemonError('APP_PORT_IN_USE', { app: 'Uptime Kuma', port: 3001 }))).toEqual({
      title: "Uptime Kuma couldn't start",
      body: 'Port 3001 is already in use by another program.',
    });
    expect(errorText(daemonError('AUTH_LOCKED', { retryAfterSeconds: 90 })).body).toBe(
      'Wait 2 minutes, then try again.',
    );
    expect(errorText(daemonError('JOB_EXCLUSIVE_RUNNING', { runningKind: 'backup' })).body).toBe(
      'Wait for the backup to finish, then try again.',
    );
  });

  it('the minimum phase 1 codes have their own copy', () => {
    for (const code of [
      'ENGINE_UNAVAILABLE',
      'ENGINE_START_FAILED',
      'APP_PORT_IN_USE',
      'AUTH_LOCKED',
      'AUTH_INVALID_PASSWORD',
      'JOB_EXCLUSIVE_RUNNING',
      'NOT_FOUND',
      'ACCESS_DENIED',
      'DISK_FULL',
    ]) {
      expect(errorText(daemonError(code)).title, code).not.toBe('Something went wrong');
    }
  });

  it('an unknown or missing code gets the generic copy; the raw message goes only to the console', () => {
    const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});
    const unknown = withRaw('SOMETHING_NEW');
    expect(errorText(unknown)).toEqual({
      title: 'Something went wrong',
      body: 'Try again. If it keeps happening, check the logs in Settings › Advanced.',
    });
    expect(console).toHaveBeenCalledWith(unknown);
    const noCode = new TRPCClientError(RAW, {
      result: { error: { data: { code: 'INTERNAL_SERVER_ERROR' } } } as never,
    });
    expect(errorLine(noCode)).toBe(
      'Something went wrong. Try again. If it keeps happening, check the logs in Settings › Advanced.',
    );
  });

  it('nothing answering is the offline copy', () => {
    expect(errorText(TRPCClientError.from(new TypeError('Failed to fetch')))).toEqual({
      title: "Can't reach hlabs",
      body: 'Check your connection and try again.',
    });
  });

  it('a mutation from a button fails as a danger toast with the mapped copy', () => {
    showErrorToast(withRaw('ENGINE_START_FAILED'));
    expect(currentToasts().at(-1)).toMatchObject({
      tone: 'danger',
      title: "The engine didn't start",
      body: 'Try again, or restart this computer.',
    });
  });
});
