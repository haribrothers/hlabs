// PublicService (US-APP-27…29, US-SYS-43, 44; D-150, D-171, D-178; 07 §7.10): making single apps reachable from the
// internet through Cloudflare Tunnel, and stopping it. It keeps the tunnel (`settings.public`), the DNS records hlabs
// made (the only ones it ever changes), the public apps (`app_public`), the connector, and the public listener's routes
// (through NetworkService and Caddy). Every change is an admin's, a job, audited, and told to the other admins; members
// can do none of it and never see Visits.
import { hlabsError, type NotificationAction, type PublicAccess, type VisitResult } from '@hlabs/api';
import { appAccess, appPublic, apps, auditLog, getSetting, setSetting, users, type HlabsDb } from '@hlabs/db';
import { TOAST_MUTATIONS, ulid } from '@hlabs/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { appSummary, catalogRow } from '../apps/list';
import type { AppService } from '../apps/service';
import type { SessionService } from '../auth/sessions';
import type { TotpService } from '../auth/totp';
import type { PublicListener, PublicRoute } from '../caddy/index';
import {
  CloudflareError,
  type CloudflareClient,
  type CloudflareCredential,
  type CloudflareSignIn,
  type TunnelConnector,
} from '../cloudflare/types';
import type { EventBus } from '../events/bus';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NetworkService } from '../network/service';
import { createNotification } from '../notifications/service';
import type { SecretStore } from '../platform/secrets';
import { SignInLimiter } from './limiter';
import { appPublicOf, toAppPublic } from './rows';
import { readVisits } from './visits';

/** The keychain item holding the Cloudflare credential (07 §7.7). */
export const CLOUDFLARE_CREDENTIAL = 'cloudflare-credential';
/** The tunnel hlabs makes in the admin's account. */
export const TUNNEL_NAME = 'hlabs';
/** How long the setup waits for the connector to say it's connected. */
const CONNECT_WAIT_MS = 15_000;

/** Who changed something: an admin (with where from), or the menu-bar app (null). */
export interface Actor {
  userId: string | null;
  role?: 'admin' | 'member';
  ip?: string | null;
}

export interface PublicServiceDeps {
  db: HlabsDb;
  bus: EventBus;
  jobs: JobRunner;
  logger: Logger;
  secrets: SecretStore;
  network: NetworkService;
  apps: AppService;
  sessions: SessionService;
  totp: TotpService;
  cloudflare: CloudflareClient;
  connector: TunnelConnector;
  dataDir: string;
  /** Caddy's public listener port (127.0.0.1 only). */
  publicPort: number;
  now?: () => number;
  /** How long the setup waits for the connector (tests make it short). */
  connectWaitMs?: number;
}

/** The manifest's `public` block (06) and what decides whether an app may be public. */
const policyBits = z.object({
  category: z.string().optional(),
  permissions: z.object({ dockerSocket: z.boolean().optional() }).partial().optional(),
  public: z
    .object({
      allowed: z.boolean().optional(),
      reason: z.string().optional(),
      ownLoginSafe: z.boolean().optional(),
      maxBodyMb: z.number().int().positive().optional(),
    })
    .partial()
    .optional(),
});

export interface PublicPolicy {
  allowed: boolean;
  /** The manifest's reason; null: "it can control your other apps". */
  reason: string | null;
  ownLoginSafe: boolean;
  maxBodyMb: number;
  media: boolean;
}

interface OnPayload {
  appId: string;
  label: string;
  access: PublicAccess;
  by: Actor;
}

interface OffPayload {
  appId: string;
  by: Actor;
}

export class PublicService {
  private signIn: { url: string; handle: CloudflareSignIn; by: Actor } | null = null;
  /** The last setup that failed, or the removal that couldn't finish at Cloudflare. */
  private failure: { step: string; jobId: string | null } | null = null;
  private setupJobId: string | null = null;
  private credentialMissing = false;
  /** Public jobs run one at a time (making apps public and private, setup, removal). */
  private queue: Promise<unknown> = Promise.resolve();
  readonly limiter = new SignInLimiter();

  constructor(private readonly deps: PublicServiceDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  private get dir() {
    return join(this.deps.dataDir, 'cloudflare');
  }

  /** The tunnel's credentials file (0600). */
  get tunnelFile() {
    return join(this.dir, 'tunnel.json');
  }

  /** Caddy's access log for the public listener (Visits). */
  get logDir() {
    return join(this.deps.dataDir, 'logs', 'public');
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private emitStatus() {
    this.deps.bus.emit('public.statusChanged', { state: this.status().cloudflare.state }, { kind: 'admins' });
  }

  private requireAdmin(by: Actor) {
    // The menu-bar app (userId null) only ever turns things off; people must be admins (07 §7.10 control 2).
    if (by.userId !== null && by.role !== 'admin') throw hlabsError('ACCESS_DENIED');
  }

  // ── Registration and start ──────────────────────────────────────────────────────────────────────────────────

  register(): void {
    const { jobs } = this.deps;
    jobs.register<{ by: Actor }>('public_setup', {
      run: (ctx) => this.serial(() => this.runSetup(ctx.jobId, ctx.payload.by, ctx.report)),
    });
    jobs.register<OnPayload>('public_on', { run: (ctx) => this.serial(() => this.runOn(ctx.payload, ctx.report)) });
    jobs.register<OffPayload>('public_off', {
      run: (ctx) =>
        this.serial(async () => {
          ctx.report(10);
          await this.makePrivateNow(ctx.payload.appId, ctx.payload.by, 'private');
        }),
    });
    jobs.register<{ by: Actor; via: 'dashboard' | 'tray' }>('public_off_all', {
      run: (ctx) => this.serial(() => this.runOffAll(ctx.payload.by, ctx.payload.via, ctx.report)),
    });
    jobs.register<{ by: Actor }>('public_remove', {
      run: (ctx) => this.serial(() => this.runRemove(ctx.jobId, ctx.payload.by, ctx.report)),
    });
  }

  /** At start: the connector runs again for a tunnel that's set up, if the credential is still here. */
  async start(): Promise<void> {
    const cf = getSetting(this.deps.db, 'public').cloudflare;
    if (!cf) return;
    this.credentialMissing = (await this.credential()) === null;
    if (this.credentialMissing) {
      this.deps.logger.warn("Cloudflare Tunnel is set up but its credential isn't in the keychain");
      return;
    }
    await this.startConnector(cf.tunnelId).catch((err: unknown) =>
      this.deps.logger.error({ err }, "cloudflared couldn't start"),
    );
  }

  async stop(): Promise<void> {
    this.signIn?.handle.cancel();
    this.signIn = null;
    await this.deps.connector.stop();
  }

  private startConnector(tunnelId: string) {
    return this.deps.connector.start({
      tunnelId,
      credentialsFile: this.tunnelFile,
      origin: `http://127.0.0.1:${this.deps.publicPort}`,
    });
  }

  private async credential(): Promise<CloudflareCredential | null> {
    const raw = await this.deps.secrets.get(CLOUDFLARE_CREDENTIAL).catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CloudflareCredential;
    } catch {
      return null;
    }
  }

  private async requireCredential(): Promise<CloudflareCredential> {
    const cred = await this.credential();
    if (!cred) throw hlabsError('PUBLIC_NOT_SET_UP', "Cloudflare's credential isn't in the keychain");
    return cred;
  }

  // ── Status ──────────────────────────────────────────────────────────────────────────────────────────────────

  status() {
    const { db } = this.deps;
    const cf = getSetting(db, 'public').cloudflare;
    const setUpBy = cf?.setUpBy
      ? (db.select({ name: users.displayName }).from(users).where(eq(users.id, cf.setUpBy)).get()?.name ?? null)
      : null;
    let state: 'off' | 'signingIn' | 'settingUp' | 'on' | 'error';
    let reason: string | null = null;
    if (this.setupJobId) state = 'settingUp';
    else if (this.signIn) state = 'signingIn';
    else if (cf) {
      state = 'on';
      if (this.credentialMissing) reason = 'credentialMissing';
      else if (this.failure) reason = this.failure.step;
      else if (this.deps.connector.state() === 'failed') reason = 'connector';
      if (reason) state = 'error';
    } else if (this.failure) {
      state = 'error';
      reason = this.failure.step;
    } else state = 'off';
    return {
      cloudflare: {
        state,
        domain: cf?.domain ?? null,
        signInUrl: this.signIn?.url ?? null,
        jobId: this.setupJobId ?? this.failure?.jobId ?? null,
        reason,
        credential: cf?.credential ?? null,
        setUpAt: cf?.setUpAt ?? null,
        setUpBy,
      },
      apps: this.rows(),
    };
  }

  /** Every public app, newest first, with its name and icon (US-SYS-44). */
  rows() {
    const { db } = this.deps;
    return db
      .select({ row: appPublic, by: users.displayName, app: apps })
      .from(appPublic)
      .innerJoin(apps, eq(apps.id, appPublic.appId))
      .leftJoin(users, eq(users.id, appPublic.enabledBy))
      .orderBy(desc(appPublic.enabledAt))
      .all()
      .map(({ row, by, app }) => {
        const summary = appSummary(db, app);
        return { ...toAppPublic(row, by), appId: app.id, name: summary.name, icon: summary.icon };
      });
  }

  /** Caddy's public listener while the tunnel is set up: each public app's route, if it has one now (D-178). */
  listener(): PublicListener | null {
    const { db } = this.deps;
    if (!getSetting(db, 'public').cloudflare) return null;
    const routed = new Map(this.deps.apps.routes().map((r) => [r.appId, r]));
    const routes: PublicRoute[] = db
      .select()
      .from(appPublic)
      .orderBy(appPublic.hostname)
      .all()
      .flatMap((row) => {
        const route = routed.get(row.appId);
        if (!route) return [];
        return [
          {
            appId: row.appId,
            hostname: row.hostname,
            port: route.port,
            access: row.access,
            maxBodyMb: this.policy(row.appId).maxBodyMb,
          },
        ];
      });
    return { port: this.deps.publicPort, logDir: this.logDir, apps: routes };
  }

  // ── Policy and options ──────────────────────────────────────────────────────────────────────────────────────

  /** What the app's manifest allows (its store listing first, like its Home tile; else its installed copy). */
  policy(appId: string): PublicPolicy {
    const app = this.deps.apps.get(appId);
    const listed = app ? policyBits.safeParse(catalogRow(this.deps.db, app)?.manifestJson) : null;
    let installed: z.infer<typeof policyBits> | null = null;
    try {
      const parsed = policyBits.safeParse(this.deps.apps.manifest(appId));
      installed = parsed.success ? parsed.data : null;
    } catch {
      // No project (a dev stand-in).
    }
    const m = { ...installed, ...(listed?.success ? listed.data : {}) };
    // An app that can control the others (the Docker socket) is never public, whatever its manifest says.
    const socket = Boolean(installed?.permissions?.dockerSocket || m.permissions?.dockerSocket);
    return {
      allowed: (m.public?.allowed ?? true) && !socket && !app?.custom,
      reason: m.public?.allowed === false ? (m.public.reason ?? null) : null,
      ownLoginSafe: m.public?.ownLoginSafe ?? false,
      maxBodyMb: m.public?.maxBodyMb ?? 10,
      media: m.category === 'media',
    };
  }

  /** Everyone allowed into the app: the admins, and members it's shared with (enabled accounts). */
  private people(appId: string) {
    const { db } = this.deps;
    const members = new Set(
      db
        .select({ userId: appAccess.userId })
        .from(appAccess)
        .where(eq(appAccess.appId, appId))
        .all()
        .map((r) => r.userId),
    );
    return db
      .select()
      .from(users)
      .where(isNull(users.disabledAt))
      .all()
      .filter((u) => u.role === 'admin' || members.has(u.id))
      .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'admin' ? -1 : 1))
      .map((u) => ({
        id: u.id,
        displayName: u.displayName,
        avatarColor: u.avatarColor,
        role: u.role,
        totpEnabled: this.deps.totp.isEnabled(u.id),
      }));
  }

  /** A label for the app under the domain: its own name, else with a number, never one in use. */
  private suggestLabel(appId: string, taken: Set<string>): string {
    const app = this.deps.apps.get(appId);
    const base = (app?.hostname ?? appId).replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'app';
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }

  /** What "Make public…" shows (US-APP-27, US-APP-28). */
  options(appId: string, by: Actor) {
    this.requireAdmin(by);
    const { db } = this.deps;
    if (!this.deps.apps.get(appId)) throw hlabsError('NOT_FOUND');
    const cf = getSetting(db, 'public').cloudflare;
    const current = appPublicOf(db, appId);
    const others = db
      .select({ appId: appPublic.appId, hostname: appPublic.hostname })
      .from(appPublic)
      .all()
      .filter((r) => r.appId !== appId);
    const label = (host: string) =>
      cf && host.endsWith(`.${cf.domain}`) ? host.slice(0, -cf.domain.length - 1) : host;
    const taken = others.map((r) => label(r.hostname));
    const policy = this.policy(appId);
    return {
      domain: cf?.domain ?? null,
      suggestedLabel: current ? label(current.hostname) : this.suggestLabel(appId, new Set(taken)),
      taken,
      allowed: policy.allowed,
      reason: policy.reason,
      ownLoginSafe: policy.ownLoginSafe,
      media: policy.media,
      people: this.people(appId),
      current,
    };
  }

  // ── Setting up and removing Cloudflare Tunnel (US-SYS-43) ───────────────────────────────────────────────────

  private assertNotSetUp() {
    if (getSetting(this.deps.db, 'public').cloudflare) throw hlabsError('PUBLIC_ALREADY_SET_UP');
    if (this.setupJobId) throw hlabsError('JOB_EXCLUSIVE_RUNNING', undefined, { runningKind: 'public_setup' });
  }

  /** "Sign in to Cloudflare": Cloudflare's link; the setup starts by itself once the admin approves a domain. */
  async startSignIn(by: Actor): Promise<{ url: string }> {
    this.requireAdmin(by);
    if (this.signIn) return { url: this.signIn.url };
    this.assertNotSetUp();
    let handle: CloudflareSignIn;
    try {
      handle = await this.deps.cloudflare.signIn();
    } catch (err) {
      throw cloudflareFailed(err);
    }
    this.signIn = { url: handle.url, handle, by };
    this.failure = null;
    this.audit(by, 'public.cloudflare.signIn', null, null);
    this.emitStatus();
    handle.done.then(
      async (cred) => {
        if (this.signIn?.handle !== handle) return;
        this.signIn = null;
        try {
          await this.deps.secrets.set(CLOUDFLARE_CREDENTIAL, JSON.stringify(cred));
          this.startSetup(by);
        } catch (err) {
          this.deps.logger.error({ err }, "couldn't keep Cloudflare's credential");
          this.failure = { step: 'signIn', jobId: null };
          this.emitStatus();
        }
      },
      (err: unknown) => {
        if (this.signIn?.handle !== handle) return; // cancelled or replaced
        this.signIn = null;
        this.deps.logger.warn({ err: (err as Error).message }, "Cloudflare's sign-in didn't finish");
        this.failure = { step: err instanceof CloudflareError ? err.step : 'signIn', jobId: null };
        this.emitStatus();
      },
    );
    return { url: handle.url };
  }

  cancelSignIn(by: Actor): void {
    this.requireAdmin(by);
    const signIn = this.signIn;
    this.signIn = null;
    signIn?.handle.cancel();
    this.emitStatus();
  }

  /** "Use an API token instead": checked now, then the same setup. The token goes to the keychain only. */
  async setupWithToken(by: Actor, domain: string, token: string): Promise<{ jobId: string }> {
    this.requireAdmin(by);
    this.assertNotSetUp();
    let cred: CloudflareCredential;
    try {
      cred = await this.deps.cloudflare.checkToken(token, domain);
    } catch (err) {
      throw cloudflareFailed(err);
    }
    const signIn = this.signIn;
    this.signIn = null;
    signIn?.handle.cancel();
    await this.deps.secrets.set(CLOUDFLARE_CREDENTIAL, JSON.stringify(cred));
    return { jobId: this.startSetup(by) };
  }

  private startSetup(by: Actor): string {
    this.failure = null;
    const jobId = this.deps.jobs.start('public_setup', { payload: { by } });
    this.setupJobId = jobId;
    this.emitStatus();
    return jobId;
  }

  private async runSetup(jobId: string, by: Actor, report: (p: number, m?: string) => void) {
    const { db } = this.deps;
    let tunnelId: string | null = null;
    try {
      const cred = await this.requireCredential();
      report(10, 'signedIn');
      const tunnel = await this.deps.cloudflare.createTunnel(cred, TUNNEL_NAME);
      tunnelId = tunnel.tunnelId;
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      writeFileSync(this.tunnelFile, JSON.stringify(tunnel.credentials), { mode: 0o600 });
      setSetting(db, 'public', {
        cloudflare: {
          domain: cred.domain,
          zoneId: cred.zoneId,
          accountId: cred.accountId,
          tunnelId,
          credential: cred.kind,
          records: [],
          setUpAt: this.now(),
          setUpBy: by.userId,
        },
      });
      this.credentialMissing = false;
      report(60, 'tunnel');
      await this.deps.network.sync();
      await this.startConnector(tunnelId);
      report(80, 'connector');
      const deadline = Date.now() + (this.deps.connectWaitMs ?? CONNECT_WAIT_MS);
      while (this.deps.connector.state() === 'starting' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (this.deps.connector.state() === 'failed')
        throw new CloudflareError('connector', "cloudflared didn't connect");
      this.audit(by, 'public.cloudflare.setUp', null, { domain: cred.domain, credential: cred.kind });
      this.setupJobId = null;
      this.emitStatus();
    } catch (err) {
      this.setupJobId = null;
      const step = err instanceof CloudflareError ? err.step : 'tunnel';
      this.failure = { step, jobId };
      // Before the tunnel exists nothing is kept: the credential goes, so "Set up" starts afresh.
      if (!tunnelId) await this.deps.secrets.delete(CLOUDFLARE_CREDENTIAL).catch(() => {});
      this.emitStatus();
      throw cloudflareFailed(err);
    }
  }

  /** "Remove Cloudflare Tunnel…" (`public_remove`). */
  remove(by: Actor): { jobId: string } {
    this.requireAdmin(by);
    if (!getSetting(this.deps.db, 'public').cloudflare) throw hlabsError('PUBLIC_NOT_SET_UP');
    return { jobId: this.deps.jobs.start('public_remove', { payload: { by } }) };
  }

  private async runRemove(jobId: string, by: Actor, report: (p: number, m?: string) => void) {
    const { db } = this.deps;
    const cf = getSetting(db, 'public').cloudflare;
    if (!cf) return;
    // Every public app private first (listed in the confirmation, US-SYS-43).
    const rows = db.select().from(appPublic).all();
    for (const [i, row] of rows.entries()) {
      await this.makePrivateNow(row.appId, by, 'remove');
      report(10 + (40 * (i + 1)) / Math.max(rows.length, 1), 'private');
    }
    await this.deps.connector.stop();
    const cred = await this.credential();
    if (cred) {
      try {
        // Only the records hlabs made, never the domain's others (D-171).
        for (const record of getSetting(db, 'public').cloudflare?.records ?? []) {
          await this.deps.cloudflare.deleteRecord(cred, record.id);
          this.forgetRecord(record.id);
        }
        report(70, 'dns');
        await this.deps.cloudflare.deleteTunnel(cred, cf.tunnelId);
        report(90, 'tunnel');
      } catch (err) {
        // The apps are private and the connector stopped; the tunnel stays listed until removing works.
        this.failure = { step: 'remove', jobId };
        this.emitStatus();
        throw cloudflareFailed(err);
      }
    }
    rmSync(this.tunnelFile, { force: true });
    rmSync(join(this.dir, 'cloudflared.yml'), { force: true });
    await this.deps.secrets.delete(CLOUDFLARE_CREDENTIAL).catch(() => {});
    setSetting(db, 'public', { cloudflare: null });
    this.failure = null;
    this.credentialMissing = false;
    await this.deps.network.sync();
    this.audit(by, 'public.cloudflare.removed', null, { domain: cf.domain, cleanedUp: cred !== null });
    this.emitStatus();
  }

  // ── Making apps public and private (US-APP-27, US-APP-28) ───────────────────────────────────────────────────

  /** `apps.setPublic`: checked now (so the dialog can say what's wrong), done as a `public_on` / `public_off` job. */
  async setPublic(
    by: Actor,
    input: { appId: string; public: boolean; hostname?: string; access?: PublicAccess; understood?: boolean },
  ): Promise<{ jobId: string }> {
    this.requireAdmin(by);
    const { db } = this.deps;
    const app = this.deps.apps.get(input.appId);
    if (!app) throw hlabsError('NOT_FOUND');
    if (!input.public) {
      return {
        jobId: this.deps.jobs.start('public_off', { target: input.appId, payload: { appId: input.appId, by } }),
      };
    }
    if (['installing', 'install_failed', 'uninstalling'].includes(app.state)) {
      throw hlabsError('APP_BUSY', undefined, { appId: app.id, state: app.state });
    }
    const cf = getSetting(db, 'public').cloudflare;
    if (!cf || this.status().cloudflare.state !== 'on') throw hlabsError('PUBLIC_NOT_SET_UP');
    const policy = this.policy(app.id);
    if (!policy.allowed) throw hlabsError('PUBLIC_NOT_ALLOWED', undefined, { reason: policy.reason });
    const current = db.select().from(appPublic).where(eq(appPublic.appId, app.id)).get();
    const access = input.access ?? current?.access ?? 'hlabs';
    if (access === 'ownLogin') {
      if (!policy.ownLoginSafe) throw hlabsError('PUBLIC_NOT_ALLOWED', undefined, { reason: null, access: 'ownLogin' });
      if (input.understood !== true && current?.access !== 'ownLogin')
        throw hlabsError('VALIDATION_FAILED', '"I understand" must be ticked', { field: 'understood' });
    }
    const options = this.options(app.id, by);
    const label = input.hostname ?? options.suggestedLabel;
    const name = `${label}.${cf.domain}`;
    const other = db.select().from(appPublic).where(eq(appPublic.hostname, name)).get();
    if (other && other.appId !== app.id) throw hlabsError('PUBLIC_HOSTNAME_TAKEN', undefined, { hostname: name });
    // Someone else's record (a website, email): never touched, so the name can't be used (D-171).
    if (name !== current?.hostname && !cf.records.some((r) => r.name === name)) {
      const cred = await this.requireCredential();
      let taken: boolean;
      try {
        taken = await this.deps.cloudflare.nameTaken(cred, name);
      } catch (err) {
        throw cloudflareFailed(err);
      }
      if (taken) throw hlabsError('PUBLIC_HOSTNAME_TAKEN', undefined, { hostname: name });
    }
    // With hlabs's login, somebody must be able to sign in: everyone allowed in needs two-factor (07 §7.10).
    if (access === 'hlabs' && !options.people.some((p) => p.totpEnabled)) {
      throw hlabsError('TWO_FACTOR_REQUIRED_FOR_PUBLIC', undefined, {
        users: options.people.map((p) => p.displayName),
      });
    }
    const payload: OnPayload = { appId: app.id, label, access, by };
    return { jobId: this.deps.jobs.start('public_on', { target: app.id, payload }) };
  }

  private async runOn(p: OnPayload, report: (progress: number, message?: string) => void) {
    const { db } = this.deps;
    const cf = getSetting(db, 'public').cloudflare;
    const app = this.deps.apps.get(p.appId);
    if (!cf) throw hlabsError('PUBLIC_NOT_SET_UP');
    if (!app) throw hlabsError('NOT_FOUND');
    const name = `${p.label}.${cf.domain}`;
    const address = `https://${name}`;
    const before = db.select().from(appPublic).where(eq(appPublic.appId, p.appId)).get() ?? null;
    const cred = await this.requireCredential();
    report(20, 'dns');
    if (!cf.records.some((r) => r.name === name)) {
      try {
        const record = await this.deps.cloudflare.addRecord(cred, name, cf.tunnelId);
        this.keepRecord({ id: record.id, name });
      } catch (err) {
        if (err instanceof CloudflareError && err.conflict)
          throw hlabsError('PUBLIC_HOSTNAME_TAKEN', undefined, { hostname: name });
        throw cloudflareFailed(err);
      }
    }
    report(60, 'route');
    const at = this.now();
    db.transaction((tx) => {
      tx.insert(appPublic)
        .values({ appId: p.appId, address, hostname: name, access: p.access, enabledBy: p.by.userId, enabledAt: at })
        .onConflictDoUpdate({ target: appPublic.appId, set: { address, hostname: name, access: p.access } })
        .run();
      // Kept current while public (07 §7.10 control 6).
      if (!app.autoUpdate) {
        tx.update(apps).set({ autoUpdate: true, updatedAt: at }).where(eq(apps.id, p.appId)).run();
        this.audit(p.by, 'app.setAutoUpdate', p.appId, { from: false, to: true, why: 'public' }, tx);
      }
      // With hlabs's login on the public address, the home address keeps it too (AppSettingsPublic).
      if (p.access === 'hlabs' && app.authMode !== 'hlabs') {
        tx.update(apps).set({ authMode: 'hlabs', updatedAt: at }).where(eq(apps.id, p.appId)).run();
        this.audit(p.by, 'app.setAuthMode', p.appId, { from: app.authMode, to: 'hlabs', why: 'public' }, tx);
      }
    });
    await this.deps.network.sync();
    report(80, 'route');
    // A new name: sign-ins on the old one end, and its record goes.
    if (before && before.hostname !== name) await this.retire(before.hostname);
    if (before && before.access === 'hlabs' && p.access !== 'hlabs') this.endSessions(name);
    const appName = appSummary(db, app).name;
    const actor = this.actorName(p.by);
    if (before) {
      this.audit(p.by, 'app.public.changed', p.appId, {
        from: { address: before.address, access: before.access },
        to: { address, access: p.access },
      });
      this.notifyOtherAdmins(p.by, {
        kind: 'app.public_changed',
        target: p.appId,
        title: `${actor} changed public access to ${appName}`,
        body:
          p.access === 'hlabs'
            ? `${address} asks for an hlabs login with two-factor.`
            : `${address} uses ${appName}'s own login only.`,
        actions: [{ kind: 'navigate', to: `/apps/${p.appId}/settings` }],
      });
    } else {
      this.audit(p.by, 'app.public.on', p.appId, { address, access: p.access });
      this.notifyOtherAdmins(p.by, {
        kind: 'app.public_on',
        target: p.appId,
        title: `${actor} made ${appName} public at ${address}`,
        body:
          p.access === 'hlabs'
            ? 'Anyone on the internet can reach it. hlabs asks for a login first.'
            : `Anyone on the internet can reach it, with ${appName}'s own login.`,
        actions: [{ kind: 'navigate', to: `/apps/${p.appId}/settings` }],
      });
    }
    this.deps.bus.emit('app.publicChanged', { appId: p.appId, public: true }, { kind: 'admins' });
  }

  /** Makes an app private before it's uninstalled (US-APP-27 edge). */
  async makePrivateFor(appId: string, by: Actor): Promise<void> {
    if (!this.deps.db.select().from(appPublic).where(eq(appPublic.appId, appId)).get()) return;
    await this.serial(() => this.makePrivateNow(appId, by, 'uninstall'));
  }

  /**
   * The address stops answering at once (Caddy's route goes), sessions signed in there end, then its DNS record is
   * deleted. A record Cloudflare wouldn't delete now stays listed, to delete with the next change or the removal.
   */
  private async makePrivateNow(appId: string, by: Actor, why: 'private' | 'all' | 'remove' | 'uninstall') {
    const { db } = this.deps;
    const row = db.select().from(appPublic).where(eq(appPublic.appId, appId)).get();
    if (!row) return;
    db.delete(appPublic).where(eq(appPublic.appId, appId)).run();
    await this.deps.network.sync();
    await this.retire(row.hostname);
    this.audit(by, 'app.public.off', appId, { address: row.address, why });
    this.deps.bus.emit('app.publicChanged', { appId, public: false }, { kind: 'admins' });
  }

  /** A public name that's no longer used: its sign-ins end and its DNS record goes. */
  private async retire(hostname: string) {
    this.endSessions(hostname);
    const cf = getSetting(this.deps.db, 'public').cloudflare;
    const record = cf?.records.find((r) => r.name === hostname);
    if (!record) return;
    const cred = await this.credential();
    if (!cred) return;
    try {
      await this.deps.cloudflare.deleteRecord(cred, record.id);
      this.forgetRecord(record.id);
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message, hostname }, "couldn't delete a public app's DNS record yet");
    }
  }

  private endSessions(hostname: string) {
    this.deps.sessions.revokeWhere((s) => s.publicHost === hostname.toLowerCase());
  }

  private keepRecord(record: { id: string; name: string }) {
    const settings = getSetting(this.deps.db, 'public');
    if (!settings.cloudflare) return;
    setSetting(this.deps.db, 'public', {
      cloudflare: { ...settings.cloudflare, records: [...settings.cloudflare.records, record] },
    });
  }

  private forgetRecord(id: string) {
    const settings = getSetting(this.deps.db, 'public');
    if (!settings.cloudflare) return;
    setSetting(this.deps.db, 'public', {
      cloudflare: { ...settings.cloudflare, records: settings.cloudflare.records.filter((r) => r.id !== id) },
    });
  }

  // ── Turning it all off (US-SYS-44) ──────────────────────────────────────────────────────────────────────────

  /** "Turn off all public access" (Settings, or the menu-bar app): the job already running when there is one. */
  turnOffAll(by: Actor, via: 'dashboard' | 'tray'): { jobId: string } {
    this.requireAdmin(by);
    const running = this.deps.jobs.listActive().find((j) => j.kind === 'public_off_all');
    if (running) return { jobId: running.id };
    return { jobId: this.deps.jobs.start('public_off_all', { payload: { by, via } }) };
  }

  private async runOffAll(by: Actor, via: 'dashboard' | 'tray', report: (p: number, m?: string) => void) {
    const { db } = this.deps;
    const rows = db.select({ appId: appPublic.appId, address: appPublic.address }).from(appPublic).all();
    for (const [i, row] of rows.entries()) {
      await this.makePrivateNow(row.appId, by, 'all');
      report((100 * (i + 1)) / Math.max(rows.length, 1));
    }
    this.audit(by, 'public.turnedOffAll', null, { apps: rows.map((r) => r.appId), via });
    if (rows.length) {
      this.notifyOtherAdmins(by, {
        kind: 'public.turned_off',
        target: null,
        title:
          by.userId === null
            ? 'Public access was turned off from the menu bar'
            : `${this.actorName(by)} turned off all public access`,
        body:
          rows.length === 1
            ? `${rows[0]!.address} is private now. Cloudflare Tunnel stays set up.`
            : `${rows.length} apps are private now. Cloudflare Tunnel stays set up.`,
        actions: [{ kind: 'navigate', to: '/settings/network' }],
      });
    }
  }

  // ── Visits and failed sign-ins (US-APP-29) ──────────────────────────────────────────────────────────────────

  visits(by: Actor, input: { appId: string; result?: VisitResult; cursor?: string; limit?: number }) {
    this.requireAdmin(by);
    const row = this.deps.db.select().from(appPublic).where(eq(appPublic.appId, input.appId)).get();
    const now = this.now();
    if (!row) {
      if (!this.deps.apps.get(input.appId)) throw hlabsError('NOT_FOUND');
      return { items: [], nextCursor: null, refused: [] };
    }
    const page = readVisits(this.logDir, row.hostname, {
      now,
      result: input.result,
      cursor: input.cursor,
      limit: input.limit ?? 50,
    });
    return {
      ...page,
      refused: this.limiter.refused(now, input.appId).map((r) => ({ ip: r.ip, until: r.until, failures: r.failures })),
    };
  }

  /** A failed sign-in on a public address; the one over the limit refuses the address and warns the admins. */
  signInFailed(appId: string, ip: string): void {
    const now = this.now();
    const { refused } = this.limiter.fail(ip, appId, now);
    if (!refused) return;
    const app = this.deps.apps.get(appId);
    const appName = app ? appSummary(this.deps.db, app).name : appId;
    this.audit({ userId: null, ip }, 'public.signIn.refused', appId, { ip, failures: refused.failures });
    const actions: NotificationAction[] = [
      { kind: 'navigate', to: `/apps/${appId}/settings`, params: { view: 'visits' } },
    ];
    // "Make private" from the notification itself, once the dashboard allows that mutation from a toast.
    if ((TOAST_MUTATIONS as readonly string[]).includes('apps.setPublic')) {
      actions.unshift({
        kind: 'mutation',
        procedure: 'apps.setPublic' as (typeof TOAST_MUTATIONS)[number],
        input: { appId, public: false },
        label: 'Make private',
      });
    }
    createNotification(this.deps.db, this.deps.bus, {
      userId: null,
      kind: 'app.public_attack',
      target: appId,
      severity: 'warning',
      title: `Someone keeps trying to sign in to ${appName}`,
      body: `${refused.failures} failed sign-ins from ${ip} in 10 minutes. That address is refused for an hour.`,
      actions,
      now,
    });
  }

  /** Development and e2e (`POST /dev/cloudflare` with `reset`): nothing public and no tunnel, as on a fresh install. */
  async resetForDev(): Promise<void> {
    const signIn = this.signIn;
    this.signIn = null;
    signIn?.handle.cancel();
    const hosts = this.deps.db.select({ hostname: appPublic.hostname }).from(appPublic).all();
    this.deps.db.delete(appPublic).run();
    for (const { hostname } of hosts) this.endSessions(hostname);
    await this.deps.connector.stop();
    await this.deps.secrets.delete(CLOUDFLARE_CREDENTIAL).catch(() => {});
    setSetting(this.deps.db, 'public', { cloudflare: null });
    rmSync(this.tunnelFile, { force: true });
    rmSync(this.logDir, { recursive: true, force: true });
    this.failure = null;
    this.setupJobId = null;
    this.credentialMissing = false;
    this.limiter.clear();
    await this.deps.network.sync();
    this.emitStatus();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

  private actorName(by: Actor): string {
    if (by.userId === null) return 'The menu-bar app';
    return (
      this.deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, by.userId)).get()?.name ??
      'An admin'
    );
  }

  /** Every enabled admin but the one who made the change (07 §7.10 control 2). */
  private notifyOtherAdmins(
    by: Actor,
    n: { kind: string; target: string | null; title: string; body: string; actions: NotificationAction[] },
  ) {
    const admins = this.deps.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
      .all()
      .filter((a) => a.id !== by.userId);
    for (const admin of admins) {
      createNotification(this.deps.db, this.deps.bus, { userId: admin.id, severity: 'info', ...n, now: this.now() });
    }
  }

  private audit(
    by: Actor,
    action: string,
    target: string | null,
    detail: Record<string, unknown> | null,
    tx: Pick<HlabsDb, 'insert'> = this.deps.db,
  ) {
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: this.now(),
        userId: by.userId,
        action,
        target,
        detailJson: detail,
        ip: by.ip ?? null,
      })
      .run();
  }
}

/** A Cloudflare failure as `CLOUDFLARE_FAILED { step }` (hlabs errors pass through). */
function cloudflareFailed(err: unknown) {
  if (err instanceof CloudflareError) return hlabsError('CLOUDFLARE_FAILED', err.message, { step: err.step });
  if (err instanceof Error && err.name === 'TRPCError') return err;
  return hlabsError('CLOUDFLARE_FAILED', (err as Error)?.message, { step: 'tunnel' });
}
