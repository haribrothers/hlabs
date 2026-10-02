// A member made through a real invite, signed in on their own cookie (for the people stories, phase 3).
import type { daemonWithAdmin } from './admin-session';
import type { Reply } from './admin-session';

type Daemon = Awaited<ReturnType<typeof daemonWithAdmin>>;

export async function memberSession(
  d: Daemon,
  opts: { username?: string; appIds?: string[]; role?: 'member' | 'admin' } = {},
) {
  const username = opts.username ?? 'anu';
  const made = (await d.mutate('invites.create', { role: opts.role ?? 'member', appIds: opts.appIds ?? [] })).result!
    .data as {
    url: string;
  };
  const res = await fetch(`${d.url}/trpc/invites.accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: made.url.split('/invite/')[1],
      displayName: 'Anu',
      username,
      password: 'correct horse battery',
    }),
  });
  if (!res.ok) throw new Error(`accept failed: ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = (await (await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as Reply;
  const csrf = me.result!.data.csrfToken as string;
  const headers = { 'content-type': 'application/json', cookie, 'x-hlabs-csrf': csrf };
  const query = async (path: string, input?: unknown): Promise<Reply & { status: number }> => {
    const url = `${d.url}/trpc/${path}${input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
    const r = await fetch(url, { headers });
    return { ...((await r.json()) as Reply), status: r.status };
  };
  const mutate = async (path: string, input?: unknown): Promise<Reply & { status: number }> => {
    const r = await fetch(`${d.url}/trpc/${path}`, { method: 'POST', headers, body: JSON.stringify(input ?? null) });
    return { ...((await r.json()) as Reply), status: r.status };
  };
  return { userId: me.result!.data.id as string, cookie, csrf, query, mutate };
}
