// US-APP-13 · Edit environment variables: apps.getConfig lists the manifest's settings with their controls and the
// variables people added; apps.setConfig saves the whole list (names checked: pattern, duplicates, reserved names; a
// number setting must be a number), a manifest setting can't be removed or renamed, and an added variable reaches the
// app's web service. Admins only.
import { appEnv } from '@hlabs/db';
import { parse } from 'yaml';
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
  prompt: { type: string; hidden: boolean; options: string[] | null } | null;
};

describe('US-APP-13', () => {
  it('getConfig lists every manifest setting with the control for its type', async () => {
    const t = await settingsApp(closers);
    const { env } = (await t.config()) as { env: Entry[] };
    expect(env.map((e) => e.key)).toEqual([
      'SIGNUPS_ALLOWED',
      'WEB_WORKERS',
      'LOG_LEVEL',
      'ADMIN_TOKEN',
      'SMTP_PASSWORD',
      'ROCKET_LIMITS',
    ]);
    expect(env[0]).toMatchObject({ value: 'true', prompt: { type: 'boolean' } });
    expect(env[1]).toMatchObject({ value: '4', prompt: { type: 'number' } });
    expect(env[2]).toMatchObject({ value: 'info', prompt: { type: 'select', options: ['info', 'warn', 'error'] } });
  });

  it('saving changes a setting, adds a variable and the app restarts on them', async () => {
    const t = await settingsApp(closers);
    const { reply, job } = await t.save('apps.setConfig', {
      env: [
        { key: 'SIGNUPS_ALLOWED', value: 'false' },
        { key: 'WEB_WORKERS', value: '8' },
        { key: 'LOG_LEVEL', value: 'warn' },
        { key: 'ADMIN_TOKEN' },
        { key: 'SMTP_PASSWORD' },
        { key: 'ROCKET_LIMITS', value: '{json=1}' },
        { key: 'DOMAIN_ALIAS', value: 'https://vault.example' },
      ],
    });
    expect(reply.error).toBeUndefined();
    expect(job?.state).toBe('succeeded');
    expect(t.row().state).toBe('running');
    expect(t.file('.env')).toContain("WEB_WORKERS='8'");
    expect(t.file('.env')).toContain("DOMAIN_ALIAS='https://vault.example'");
    const compose = parse(t.file('docker-compose.yml')) as {
      services: { vaultwarden: { environment: Record<string, string> } };
    };
    expect(compose.services.vaultwarden.environment.DOMAIN_ALIAS).toBe('${DOMAIN_ALIAS}');
    const { env } = (await t.config()) as { env: Entry[] };
    expect(env.at(-1)).toEqual({
      key: 'DOMAIN_ALIAS',
      value: 'https://vault.example',
      secret: false,
      generated: false,
      prompt: null,
    });
    // Secrets left out stay as they were.
    expect(t.file('.env')).toContain("SMTP_PASSWORD='mail-pass'");
    // The audit log has the keys that changed, never values.
    const [audit] = t.audits('app.setConfig');
    expect(audit!.detailJson).toEqual({
      keys: ['DOMAIN_ALIAS', 'LOG_LEVEL', 'ROCKET_LIMITS', 'SIGNUPS_ALLOWED', 'WEB_WORKERS'],
    });
    expect(JSON.stringify(audit)).not.toContain('vault.example');
  });

  it('an added variable can be removed again; a manifest setting left out keeps its value', async () => {
    const t = await settingsApp(closers);
    await t.save('apps.setConfig', { env: [{ key: 'EXTRA', value: '1' }] });
    expect(
      t.s.db
        .select()
        .from(appEnv)
        .all()
        .map((r) => r.key),
    ).toContain('EXTRA');
    await t.save('apps.setConfig', { env: [] });
    const keys = t.s.db
      .select()
      .from(appEnv)
      .all()
      .map((r) => r.key);
    expect(keys).not.toContain('EXTRA');
    expect(keys).toContain('WEB_WORKERS');
    expect(t.file('.env')).not.toContain('EXTRA=');
  });

  it.each([
    ['lower-case', 'lower', 'BAD_REQUEST'],
    ['starts with a digit', '1ABC', 'BAD_REQUEST'],
  ])('a name that is %s is refused', async (_what, key) => {
    const t = await settingsApp(closers);
    const { reply } = await t.save('apps.setConfig', { env: [{ key, value: 'x' }] });
    expect(reply.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });

  it.each(['HLABS_URL', 'TZ', 'PUID', 'PGID'])('the reserved name %s is refused', async (key) => {
    const t = await settingsApp(closers);
    const { reply } = await t.save('apps.setConfig', { env: [{ key, value: 'x' }] });
    expect(reply.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { key, reason: 'reserved' } });
    expect(t.audits('app.setConfig')).toEqual([]);
  });

  it('a name used twice is refused', async () => {
    const t = await settingsApp(closers);
    const { reply } = await t.save('apps.setConfig', {
      env: [
        { key: 'EXTRA', value: '1' },
        { key: 'EXTRA', value: '2' },
      ],
    });
    expect(reply.error?.data).toMatchObject({ detail: { key: 'EXTRA', reason: 'duplicate' } });
  });

  it("a number setting that isn't a number is refused, and nothing changes", async () => {
    const t = await settingsApp(closers);
    const before = t.file('.env');
    const { reply } = await t.save('apps.setConfig', { env: [{ key: 'WEB_WORKERS', value: 'lots' }] });
    expect(reply.error?.data).toMatchObject({
      hlabsCode: 'APP_ENV_INVALID',
      detail: { key: 'WEB_WORKERS', reason: 'number' },
    });
    expect(t.file('.env')).toBe(before);
    expect(t.row().state).toBe('running');
  });

  it('members get FORBIDDEN', async () => {
    const t = await settingsApp(closers);
    const member = await memberSession(t.d, { appIds: ['vaultwarden'] });
    expect((await member.query('apps.getConfig', { appId: 'vaultwarden' })).status).toBe(403);
    expect((await member.mutate('apps.setConfig', { appId: 'vaultwarden', env: [] })).status).toBe(403);
  });
});
