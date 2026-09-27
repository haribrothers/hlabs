// US-ONB-02 · See the welcome screen and start setup: "Get started" saves step `system`.
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
  const setStep = async (step: string) => {
    const res = await fetch(`${daemon.url}/trpc/onboarding.setStep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hlabs-setup': token },
      body: JSON.stringify({ step }),
    });
    return (await res.json()) as { result?: { data: unknown }; error?: { data: { hlabsCode: string } } };
  };
  const status = async () =>
    ((await (await fetch(`${daemon.url}/trpc/onboarding.status`)).json()) as { result: { data: { step: string } } })
      .result.data;
  return { setStep, status };
}

describe('US-ONB-02', () => {
  it('Get started saves step system', async () => {
    const { setStep, status } = await start();
    expect((await status()).step).toBe('welcome');
    expect((await setStep('system')).result?.data).toEqual({ ok: true });
    expect((await status()).step).toBe('system');
  });

  it('pressing Get started again (another tab, a double click) changes nothing', async () => {
    const { setStep, status } = await start();
    await setStep('system');
    expect((await setStep('system')).result?.data).toEqual({ ok: true });
    expect((await status()).step).toBe('system');
  });

  it('cannot jump past a step that needs an action', async () => {
    const { setStep, status } = await start();
    expect((await setStep('account')).error?.data.hlabsCode).toBe('ONBOARDING_STEP_INVALID');
    await setStep('system');
    // The system check must pass first (onboarding.confirmSystem, US-ONB-04).
    expect((await setStep('account')).error?.data.hlabsCode).toBe('ONBOARDING_STEP_INVALID');
    expect((await setStep('welcome')).error?.data.hlabsCode).toBe('ONBOARDING_STEP_INVALID');
    expect((await status()).step).toBe('system');
  });
});
