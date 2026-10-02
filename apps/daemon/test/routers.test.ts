import { listProcedures } from '@hlabs/api';
import { afterEach, describe, expect, it } from 'vitest';
import { implementedPaths } from '../src/routers/index';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function call(url: string, path: string, type: 'query' | 'mutation' = 'query', input?: unknown) {
  const res =
    type === 'query'
      ? await fetch(
          `${url}/trpc/${path}${input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`}`,
        )
      : await fetch(`${url}/trpc/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input ?? null),
        });
  return {
    status: res.status,
    body: (await res.json()) as { result?: { data: unknown }; error?: { data: Record<string, unknown> } },
  };
}

describe('routers', () => {
  it('only implements procedures that exist in @hlabs/api', () => {
    const known = new Set(listProcedures().map((p) => p.path));
    for (const path of implementedPaths()) expect(known).toContain(path);
  });

  it('answers NOT_IMPLEMENTED (501) for stubbed procedures, with the hlabsCode and no stack', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    const { status, body } = await call(d.url, 'ai.get');
    expect(status).toBe(501);
    expect(body.error?.data).toMatchObject({ hlabsCode: 'NOT_IMPLEMENTED', path: 'ai.get' });
    expect(body.error?.data).not.toHaveProperty('stack');
  });

  it('checks access before anything else', async () => {
    const d = await startDaemon({ config: { devAnonymousAdmin: false } });
    closers.push(d.close);
    expect((await call(d.url, 'system.health')).status).toBe(200);
    const admin = await call(d.url, 'system.restartDaemon', 'mutation');
    expect(admin.status).toBe(401);
    expect(admin.body.error?.data.hlabsCode).toBe('AUTH_REQUIRED');
    const setup = await call(d.url, 'onboarding.checkSystem');
    expect(setup.body.error?.data.hlabsCode).toBe('ONBOARDING_SETUP_TOKEN_REQUIRED');
    const tray = await call(d.url, 'tray.status');
    expect(tray.body.error?.data.hlabsCode).toBe('AUTH_REQUIRED');
  });

  it('validates input with the api schemas', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    const { status, body } = await call(d.url, 'jobs.get', 'query', { jobId: '' });
    expect(status).toBe(400);
    expect(body.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });

  it('serves system.health, system.info and jobs through tRPC', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    expect((await call(d.url, 'system.health')).body.result?.data).toEqual({ status: 'ok', version: '0.0.0-test' });
    const info = (await call(d.url, 'system.info')).body.result?.data;
    expect(info).toMatchObject({
      hostname: 'hlabs',
      engine: { kind: 'orbstack', running: true, version: '27.0.0-fake' },
    });

    const jobId = d.services!.jobs.start('noop', { payload: { steps: 2 } });
    await d.services!.jobs.settled(jobId);
    expect((await call(d.url, 'jobs.get', 'query', { jobId })).body.result?.data).toMatchObject({
      id: jobId,
      state: 'succeeded',
      progress: 100,
    });
    expect((await call(d.url, 'jobs.get', 'query', { jobId: 'nope' })).body.error?.data.hlabsCode).toBe('NOT_FOUND');
  });

  it('answers DAEMON_STARTING before boot finishes', async () => {
    const d = await startDaemon({ skipBoot: true });
    closers.push(d.close);
    const { status, body } = await call(d.url, 'system.info');
    expect(status).toBe(503);
    expect(body.error?.data.hlabsCode).toBe('DAEMON_STARTING');
  });
});
