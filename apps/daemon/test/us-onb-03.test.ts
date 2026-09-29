// US-ONB-03 · Resume onboarding where I left off, and only until it's done (server side).
import { listProcedures } from '@hlabs/api';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function start() {
  const printed: string[] = [];
  const daemon = await startDaemon({ boot: { print: (line) => printed.push(line) } });
  closers.push(daemon.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  return { ...daemon, token };
}

const status = async (url: string) =>
  ((await (await fetch(`${url}/trpc/onboarding.status`)).json()) as { result: { data: Record<string, unknown> } })
    .result.data;

describe('US-ONB-03', () => {
  it('keeps the saved step on the server, across restarts', async () => {
    const first = await start();
    await fetch(`${first.url}/trpc/onboarding.setStep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hlabs-setup': first.token },
      body: JSON.stringify({ step: 'system' }),
    });
    await first.close();
    closers.splice(closers.indexOf(first.close), 1);

    const second = await startDaemon({ config: first.config, boot: { print: () => {} } });
    closers.push(second.close);
    expect(await status(second.url)).toEqual({ completed: false, step: 'system', hasUsers: false });
  });

  it('refuses every onboarding mutation with FORBIDDEN ONBOARDING_COMPLETE once onboarding is done', async () => {
    const { url, token } = await start();
    await fetch(`${url}/dev/complete-onboarding`, { method: 'POST' });
    const mutations = listProcedures().filter((p) => p.path.startsWith('onboarding.') && p.type === 'mutation');
    expect(mutations.length).toBeGreaterThan(5);
    for (const { path } of mutations) {
      const res = await fetch(`${url}/trpc/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hlabs-setup': token },
        body: JSON.stringify(null),
      });
      const body = (await res.json()) as { error: { data: { code: string; hlabsCode: string } } };
      expect(res.status, path).toBe(403);
      expect(body.error.data.hlabsCode, path).toBe('ONBOARDING_COMPLETE');
    }
  });

  it('status stays public and never returns user data', async () => {
    const { url } = await start();
    expect(Object.keys(await status(url)).sort()).toEqual(['completed', 'hasUsers', 'step']);
  });
});
