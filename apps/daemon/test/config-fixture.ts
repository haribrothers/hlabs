// An installed app for the App settings stories (US-APP-13…19): Vaultwarden from a store copy whose manifest asks for
// one setting of each kind (a number, a choice, a generated secret, a secret people type, a hidden one), with a
// folder it may use, running on the fake engine.
import { apps, auditLog, jobs as jobsTable } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reply } from './admin-session';
import { fakeProbes, installDaemon } from './install-harness';
import { storeFixture } from './store-fixture';

export const SETTINGS_ENV = `env:
  - key: SIGNUPS_ALLOWED
    label: Let people create accounts
    type: boolean
    default: true
  - key: WEB_WORKERS
    label: Workers
    type: number
    default: 4
  - key: LOG_LEVEL
    label: Log level
    type: select
    options: [info, warn, error]
    default: info
  - key: ADMIN_TOKEN
    type: secret
    generate: true
    hidden: true
  - key: SMTP_PASSWORD
    label: Mail password
    type: secret
    required: false
  - key: ROCKET_LIMITS
    type: string
    hidden: true
    default: '{json=10485760}'
folders:
  - key: attachments
    label: Attachments to import
    description: For importing attachments
    target: /import
    default: home:Documents
    mode: rw
    required: false
`;

/** The store copy with Vaultwarden's settings above (and `extra` appended to its manifest). */
export function settingsStore(extra = '', permissions?: string): string {
  const dir = storeFixture();
  const file = join(dir, 'apps', 'vaultwarden', 'hlabs-app.yml');
  let text = readFileSync(file, 'utf8').replace(/env:\n(?: {2}.*\n|\s{4}.*\n)*/, '');
  if (permissions) text = text.replace(/^permissions: .*$/m, `permissions: ${permissions}`);
  writeFileSync(file, `${text.trimEnd()}\n${SETTINGS_ENV}${extra}`);
  const compose = join(dir, 'apps', 'vaultwarden', 'docker-compose.yml');
  writeFileSync(
    compose,
    readFileSync(compose, 'utf8').replace(
      '      - ${HLABS_APP_DATA}/data:/data',
      '      - ${HLABS_APP_DATA}/data:/data\n      - ${HLABS_FOLDER_ATTACHMENTS}:/import',
    ),
  );
  return dir;
}

export async function settingsApp(
  closers: Array<() => Promise<void>>,
  opts: {
    extra?: string;
    /** Replaces the manifest's `permissions: { network: internet }`. */
    permissions?: string;
    http?: (url: string) => number | null;
    env?: Record<string, string>;
  } = {},
) {
  let http = opts.http ?? (() => 200);
  const probes = fakeProbes((url) => http(url));
  const t = await installDaemon(closers, { storeDir: settingsStore(opts.extra, opts.permissions), probes });
  const res = (await t.d.mutate('apps.install', {
    appId: 'vaultwarden',
    env: { SMTP_PASSWORD: 'mail-pass', ...opts.env },
    acceptRisks: true,
  })) as Reply;
  if (!res.result) throw new Error(`install failed: ${JSON.stringify(res.error)}`);
  await t.s.jobs.settled(res.result.data.jobId as string);
  const row = () => t.s.db.select().from(apps).where(eq(apps.id, 'vaultwarden')).get()!;
  if (row().state !== 'running') throw new Error(`vaultwarden is ${row().state}`);
  const q = (path: string, input: unknown) =>
    t.d.query(`${path}?input=${encodeURIComponent(JSON.stringify(input))}`) as Promise<Reply>;
  const config = async () => (await q('apps.getConfig', { appId: 'vaultwarden' })).result!.data as never;
  const audits = (action: string) => t.s.db.select().from(auditLog).where(eq(auditLog.action, action)).all();
  const projectDir = t.s.apps.project('vaultwarden').dir;
  const file = (name: string) => readFileSync(join(projectDir, name), 'utf8');
  /** Saves and waits for the restart job. */
  const save = async (path: 'apps.setConfig' | 'apps.setPermissions', input: Record<string, unknown>) => {
    const reply = (await t.d.mutate(path, { appId: 'vaultwarden', ...input })) as Reply;
    if (!reply.result) return { reply, job: null };
    const job = await t.s.jobs.settled(reply.result.data.jobId as string);
    return { reply, job };
  };
  const job = (id: string) => t.s.db.select().from(jobsTable).where(eq(jobsTable.id, id)).get();
  return {
    ...t,
    probes,
    setHttp: (fn: (url: string) => number | null) => void (http = fn),
    row,
    q,
    config,
    audits,
    projectDir,
    file,
    save,
    job,
  };
}
