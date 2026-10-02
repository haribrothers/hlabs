// US-SYS-06 · Use a local DNS server (first-run instance: the choice doesn't disturb other specs). A small stand-in
// answers as Pi-hole v6 does: a session for the right app password, then dnsmasq lines.
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

const body = (req: IncomingMessage) =>
  new Promise<string>((r) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => r(b));
  });

function fakePihole() {
  let lines: string[] = [];
  const sessions = new Set<string>();
  let next = 0;
  const server = createServer(async (req, res) => {
    if (req.url === '/api/auth' && req.method === 'POST') {
      const ok = (JSON.parse(await body(req)) as { password: string }).password === 'app-pass';
      const sid = `s${++next}`;
      if (ok) sessions.add(sid);
      return res.end(JSON.stringify({ session: ok ? { valid: true, sid } : { valid: false } }));
    }
    const sid = String(req.headers.sid ?? '');
    if (!sessions.has(sid)) return res.writeHead(401).end();
    if (req.url === '/api/auth' && req.method === 'DELETE') {
      sessions.delete(sid);
      return res.writeHead(204).end();
    }
    if (req.url === '/api/config/misc/dnsmasq_lines' && req.method === 'GET')
      return res.end(JSON.stringify({ config: { misc: { dnsmasq_lines: lines } } }));
    if (req.url === '/api/config' && req.method === 'PATCH') {
      lines = (JSON.parse(await body(req)) as { config: { misc: { dnsmasq_lines: string[] } } }).config.misc
        .dnsmasq_lines;
      return res.end('{}');
    }
    res.writeHead(404).end();
  });
  return { server, lines: () => lines };
}

test('US-SYS-06 Pi-hole is tested and kept in sync; another DNS server lists the records; None removes them', async ({
  page,
  request,
}) => {
  const pihole = fakePihole();
  await new Promise<void>((r) => pihole.server.listen(0, '127.0.0.1', r));
  const address = `http://127.0.0.1:${(pihole.server.address() as AddressInfo).port}`;
  try {
    await finishOnboarding(page, request);
    await page.goto('/settings/network');
    const home = page.getByRole('group', { name: 'Home network' });
    await expect(home.getByText("Point your router's DNS at it so every device uses it.")).toBeVisible();
    await home.getByRole('button', { name: 'Change local DNS server' }).click();
    const dialog = page.getByRole('dialog', { name: 'Local DNS server' });
    await expect(dialog.getByRole('radio', { name: /AdGuard Home/ })).toBeDisabled();
    expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);

    await dialog.getByRole('radio', { name: /Pi-hole/ }).click();
    await dialog.getByLabel('Pi-hole address').fill(address);
    await dialog.getByLabel('App password').fill('wrong');
    await dialog.getByRole('button', { name: 'Test' }).click();
    await expect(dialog.getByText('Pi-hole refused the app password')).toBeVisible();
    await dialog.getByLabel('App password').fill('app-pass');
    await dialog.getByRole('button', { name: 'Test' }).click();
    await expect(dialog.getByText('Pi-hole answered and accepted the password')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(home.getByText(`Pi-hole at ${address}`)).toBeVisible();
    // One wildcard per domain, to this computer's address on the network.
    await expect
      .poll(() => pihole.lines().map((l) => l.replace(/\/[^/]+$/, '')))
      .toEqual(expect.arrayContaining([expect.stringMatching(/^address=\/[^/]+\.home\.arpa$/)]));

    await home.getByRole('button', { name: 'Change local DNS server' }).click();
    await dialog.getByRole('radio', { name: /Another DNS server/ }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(home.getByText(/\.home\.arpa · A · /).first()).toBeVisible();
    await expect(home.getByRole('button', { name: 'Copy records' })).toBeVisible();
    // Only what hlabs wrote is removed.
    expect(pihole.lines()).toEqual([]);

    await home.getByRole('button', { name: 'Change local DNS server' }).click();
    await dialog.getByRole('radio', { name: /None/ }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(home.getByRole('button', { name: 'Copy records' })).toBeHidden();
  } finally {
    pihole.server.close();
  }
});
