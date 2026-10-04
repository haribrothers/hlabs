// A daemon at the given onboarding step with the admin created and signed in (for stories after US-ONB-08).
import type { BootDeps } from '../src/boot';
import type { DaemonConfig } from '../src/config';
import type { FakeEngine } from './fakes/engine';
import { startDaemon } from './helpers';

export type Reply = {
  result?: { data: Record<string, unknown> };
  error?: { data: { hlabsCode: string; detail?: unknown } };
};

export async function daemonWithAdmin(
  closers: Array<() => Promise<void>>,
  config: Partial<DaemonConfig> = {},
  boot: Partial<BootDeps> = {},
  engine?: FakeEngine,
) {
  const printed: string[] = [];
  const d = await startDaemon({
    config: { devAnonymousAdmin: false, ...config },
    boot: { print: (l) => printed.push(l), ...boot },
    engine,
  });
  closers.push(d.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  await fetch(`${d.url}/dev/reset-onboarding`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ step: 'account' }),
  });
  const created = await fetch(`${d.url}/trpc/onboarding.createAdmin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hlabs-setup': token },
    body: JSON.stringify({ displayName: 'Hari', username: 'hari', password: 'correct horse battery' }),
  });
  const cookie = created.headers.get('set-cookie')!.split(';')[0]!;
  const userId = ((await created.json()) as Reply).result!.data.userId as string;
  const me = (await (await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as Reply;
  const csrf = me.result!.data.csrfToken as string;
  const headers = { 'content-type': 'application/json', cookie, 'x-hlabs-csrf': csrf };

  /** A mutation as the signed-in admin; `undefined` input goes batched, like the dashboard sends it. */
  const mutate = async (path: string, input?: unknown): Promise<Reply> => {
    if (input === undefined) {
      const res = await fetch(`${d.url}/trpc/${path}?batch=1`, { method: 'POST', headers, body: '{}' });
      return ((await res.json()) as Reply[])[0]!;
    }
    const res = await fetch(`${d.url}/trpc/${path}`, { method: 'POST', headers, body: JSON.stringify(input) });
    return (await res.json()) as Reply;
  };
  const query = async (path: string, input?: unknown): Promise<Reply> => {
    const search = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
    return (await (await fetch(`${d.url}/trpc/${path}${search}`, { headers })).json()) as Reply;
  };
  return { ...d, token, userId, cookie, csrf, mutate, query };
}
