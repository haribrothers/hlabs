// US-APP-14 · Secrets are hidden and can be revealed by an admin: apps.getConfig never sends a secret's value;
// apps.revealSecret returns one, written to the audit log (key only); a generated secret can't be edited; a variable
// someone adds can be a secret, kept out of SQLite; hidden settings are marked so the dashboard puts them under
// "Show advanced".
import { appEnv, auditLog } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { settingsApp } from './config-fixture';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Entry = {
  key: string;
  value: string | null;
  secret: boolean;
  generated: boolean;
  prompt: { hidden: boolean } | null;
};

describe('US-APP-14', () => {
  it('secrets come masked: no value is sent until revealed', async () => {
    const t = await settingsApp(closers);
    const config = (await t.config()) as { env: Entry[] };
    const token = config.env.find((e) => e.key === 'ADMIN_TOKEN')!;
    const smtp = config.env.find((e) => e.key === 'SMTP_PASSWORD')!;
    expect(token).toMatchObject({ value: null, secret: true, generated: true });
    expect(smtp).toMatchObject({ value: null, secret: true, generated: false });
    expect(JSON.stringify(config)).not.toContain('mail-pass');
    const generated = /ADMIN_TOKEN='([^']+)'/.exec(t.file('.env'))![1]!;
    expect(JSON.stringify(config)).not.toContain(generated);
  });

  it('revealSecret returns the value and writes the audit log with the key only', async () => {
    const t = await settingsApp(closers);
    const reply = await t.d.mutate('apps.revealSecret', { appId: 'vaultwarden', key: 'SMTP_PASSWORD' });
    expect(reply.result?.data).toEqual({ value: 'mail-pass' });
    const audits = t.audits('app.revealSecret');
    expect(audits).toEqual([expect.objectContaining({ target: 'vaultwarden', detailJson: { key: 'SMTP_PASSWORD' } })]);
    expect(JSON.stringify(t.s.db.select().from(auditLog).all())).not.toContain('mail-pass');
  });

  it('a value that is not a secret is not revealed this way', async () => {
    const t = await settingsApp(closers);
    const reply = await t.d.mutate('apps.revealSecret', { appId: 'vaultwarden', key: 'WEB_WORKERS' });
    expect(reply.error?.data.hlabsCode).toBe('NOT_FOUND');
    expect(t.audits('app.revealSecret')).toEqual([]);
  });

  it('a generated secret can be revealed but not edited', async () => {
    const t = await settingsApp(closers);
    const value = (await t.d.mutate('apps.revealSecret', { appId: 'vaultwarden', key: 'ADMIN_TOKEN' })).result!.data
      .value as string;
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { reply } = await t.save('apps.setConfig', { env: [{ key: 'ADMIN_TOKEN', value: 'mine' }] });
    expect(reply.error?.data).toMatchObject({
      hlabsCode: 'VALIDATION_FAILED',
      detail: { key: 'ADMIN_TOKEN', reason: 'generated' },
    });
    expect(t.file('.env')).toContain(`ADMIN_TOKEN='${value}'`);
  });

  it('a secret someone types can be changed; left without a value, it stays', async () => {
    const t = await settingsApp(closers);
    await t.save('apps.setConfig', { env: [{ key: 'SMTP_PASSWORD', value: 'new-pass' }] });
    expect(t.file('.env')).toContain("SMTP_PASSWORD='new-pass'");
    await t.save('apps.setConfig', { env: [{ key: 'SMTP_PASSWORD' }] });
    expect(t.file('.env')).toContain("SMTP_PASSWORD='new-pass'");
  });

  it('a variable added as a secret is kept out of SQLite and comes back masked', async () => {
    const t = await settingsApp(closers);
    const { job } = await t.save('apps.setConfig', { env: [{ key: 'API_KEY', value: 'k-123', secret: true }] });
    expect(job?.state).toBe('succeeded');
    const row = t.s.db
      .select()
      .from(appEnv)
      .all()
      .find((r) => r.key === 'API_KEY')!;
    expect(row).toMatchObject({ value: null, isSecret: true, secretRef: 'env' });
    expect(t.file('.env')).toContain("API_KEY='k-123'");
    const config = (await t.config()) as { env: Entry[] };
    expect(config.env.find((e) => e.key === 'API_KEY')).toMatchObject({ value: null, secret: true, prompt: null });
    expect(JSON.stringify(config)).not.toContain('k-123');
    // Saved again without its value, it keeps it.
    await t.save('apps.setConfig', { env: [{ key: 'API_KEY', secret: true }] });
    expect(t.file('.env')).toContain("API_KEY='k-123'");
    const revealed = await t.d.mutate('apps.revealSecret', { appId: 'vaultwarden', key: 'API_KEY' });
    expect(revealed.result?.data).toEqual({ value: 'k-123' });
  });

  it('hidden settings are marked hidden', async () => {
    const t = await settingsApp(closers);
    const config = (await t.config()) as { env: Entry[] };
    const hidden = config.env.filter((e) => e.prompt?.hidden).map((e) => e.key);
    expect(hidden).toEqual(['ADMIN_TOKEN', 'ROCKET_LIMITS']);
  });

  it('members get FORBIDDEN', async () => {
    const t = await settingsApp(closers);
    const member = await memberSession(t.d, { appIds: ['vaultwarden'] });
    const res = await member.mutate('apps.revealSecret', { appId: 'vaultwarden', key: 'SMTP_PASSWORD' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res)).not.toContain('mail-pass');
  });
});
