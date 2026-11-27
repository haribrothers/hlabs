import { notificationActionsSchema, onboardingStepSchema, severitySchema } from '@hlabs/api';
import {
  APP_STATES,
  appMounts,
  apps,
  appSources,
  catalogApps,
  getSetting,
  type HlabsDb,
  invites,
  jobs,
  loginAttempts,
  sessions,
  setSetting,
  settingsSchemas,
  storageLocations,
  users,
} from '@hlabs/db';
import { type OnboardingStep, ulid } from '@hlabs/shared';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSync } from 'otplib';
import { hashPassword } from '../auth/passwords';
import { createAdmin } from '../onboarding/create-admin';
import { prepareStorageRoot, setStorageRoot } from '../onboarding/storage';
import { cookieDomain, sessionCookie } from '../auth/sessions';
import { FakeTailscale } from '../tailscale/fake';
import { FAKE_CLOUDFLARE_TOKEN, FakeCloudflare } from '../cloudflare/fake';
import { appendAccessLine } from '../public/visits';
import { FakeNas } from '../platform/fake-nas';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ServiceHolder } from '../services';
import { DEMO_PEOPLE } from '../demo/figures';
import { seedDemo } from '../demo/seed';

/** Development-only routes. Never registered in production. */
/**
 * What a fresh install has, whatever an earlier e2e spec on this instance changed: no users (so no sessions) or log-in
 * attempts, onboarding at `step`, the startup switches on (US-SYS-20), the people policy and no invites
 * (US-ACCT-18…21), remote access off (US-SYS-02…41), web ports as given or the defaults (US-SYS-05), and no local DNS
 * server (US-SYS-06).
 */
function asFreshInstall(db: HlabsDb, step: OnboardingStep, ports?: { https: number; http: number }) {
  db.delete(users).run();
  db.delete(loginAttempts).run();
  setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), completedAt: null, step });
  setSetting(db, 'startup', settingsSchemas.startup.parse(undefined));
  setSetting(db, 'people', settingsSchemas.people.parse(undefined));
  setSetting(db, 'remote', settingsSchemas.remote.parse(undefined));
  db.delete(invites).run();
  const fresh = settingsSchemas.network.parse(undefined);
  setSetting(db, 'network', { ...getSetting(db, 'network'), ports: ports ?? fresh.ports, dns: fresh.dns });
}

export function registerDevRoutes(app: FastifyInstance, holder: ServiceHolder): void {
  const body = z
    .object({ message: z.string().max(200).default('Hello from hlabsd') })
    .default({ message: 'Hello from hlabsd' });

  app.post('/dev/emit-test-event', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { message } = body.parse(req.body ?? undefined);
    const entry = services.bus.emit('system.test', { message });
    return { id: entry.id };
  });

  // A notification for all admins (US-STATE-16 e2e), as a service would raise it.
  const notifyBody = z.object({
    kind: z.string().default('dev.test'),
    target: z.string().nullable().default(null),
    severity: severitySchema.default('warning'),
    title: z.string().min(1).max(120),
    body: z.string().max(300).nullable().default(null),
    actions: notificationActionsSchema.default([]),
  });
  app.post('/dev/notify', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const n = notifyBody.parse(req.body);
    return { notificationId: services.notifications.create({ userId: null, ...n }) };
  });

  // A warning in hlabs's own log (US-SYS-27 e2e): what the log viewer shows, with anything secret masked.
  const logLineBody = z.object({ message: z.string().min(1).max(500) });
  app.post('/dev/log-line', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { message } = logLineBody.parse(req.body);
    services.logger.warn(message);
    return { ok: true };
  });

  // First-run gate in e2e (US-ONB-01): the setup URL the daemon printed, and a shortcut past onboarding
  // until the onboarding stories that complete it are built.
  app.get('/dev/setup-url', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    return { url: await services.onboarding.setupUrl() };
  });

  // Puts onboarding back at a step, as a fresh install (`asFreshInstall`), with the setup token kept or made again
  // (e2e specs start from a known state).
  const resetBody = z.object({ step: onboardingStepSchema.default('welcome') }).default({ step: 'welcome' });
  app.post('/dev/reset-onboarding', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { step } = resetBody.parse(req.body ?? undefined);
    asFreshInstall(services.db, step);
    // And the default name on the network (D-098).
    setSetting(services.db, 'hostname', settingsSchemas.hostname.parse(undefined));
    return { url: await services.onboarding.prepareSetupToken() };
  });

  app.post('/dev/complete-onboarding', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    if (!services.onboarding.completed) await services.onboarding.markComplete();
    return { completed: true };
  });

  // Signs this browser in as the first admin (making a `dev` admin with a random password when there is none), so
  // dashboard specs and `pnpm dev` get past the log-in screens (US-AUTH-14).
  app.get('/dev/sign-in', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { db } = services;
    let admin = db.select().from(users).where(eq(users.role, 'admin')).get();
    if (!admin) {
      admin = db
        .insert(users)
        .values({
          id: ulid(),
          username: 'dev',
          displayName: 'Developer',
          role: 'admin',
          passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
          createdAt: Date.now(),
        })
        .returning()
        .get();
    }
    // A storage root as onboarding would choose, so installs have a Home to put folders in (US-STORE-08).
    if (!db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get()) {
      const root = join(services.config.paths.dataDir, 'storage');
      await prepareStorageRoot(root, admin.username);
      db.insert(storageLocations)
        .values({ id: ulid(), kind: 'local', name: 'This computer', path: root, isRoot: true, lastSeenAt: Date.now() })
        .run();
    }
    const session = services.sessions.create({
      userId: admin.id,
      remember: true,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    // The same Domain the real login uses, so apps behind forward auth see it (US-AUTH-14, US-APP-01).
    const domain = cookieDomain(req.host ?? null, getSetting(db, 'hostname'));
    return reply.header('set-cookie', sessionCookie(session.raw, { ...session, domain })).redirect('/');
  });

  // Gives the first admin a known password, for e2e of actions that ask for it again (a restore, US-BKP-19).
  const adminPasswordBody = z.object({ password: z.string().min(8) });
  app.post('/dev/admin-password', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { password } = adminPasswordBody.parse(req.body ?? {});
    const admin = services.db.select().from(users).where(eq(users.role, 'admin')).get();
    if (!admin) return reply.code(404).send({ reason: 'no admin' });
    services.db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, admin.id))
      .run();
    return { ok: true };
  });

  // Ends every session of a user, as revoking from another device will (US-AUTH-15 e2e).
  const revokeBody = z.object({ username: z.string() });
  app.post('/dev/revoke-sessions', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { username } = revokeBody.parse(req.body);
    const user = services.db.select().from(users).where(eq(users.username, username)).get();
    if (!user) return reply.code(404).send({ reason: 'no such user' });
    return { revoked: services.sessions.revoke({ userId: user.id }).length };
  });

  // Moves a person's sessions back in time, as if they began `ms` ago (US-SYS-46 e2e: the public dashboard's session
  // ends 12 hours after it began, however active it is). `publicOnly`: only those bound to a public address.
  const ageBody = z.object({
    username: z.string(),
    ms: z.number().int().min(0),
    publicOnly: z.boolean().default(false),
  });
  app.post('/dev/age-sessions', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { username, ms, publicOnly } = ageBody.parse(req.body);
    const user = services.db.select().from(users).where(eq(users.username, username)).get();
    if (!user) return reply.code(404).send({ reason: 'no such user' });
    const rows = services.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .all()
      .filter((r) => !publicOnly || r.publicHost !== null);
    for (const r of rows)
      services.db
        .update(sessions)
        .set({ createdAt: r.createdAt - ms, lastSeenAt: r.lastSeenAt - ms, expiresAt: r.expiresAt - ms })
        .where(eq(sessions.id, r.id))
        .run();
    return { aged: rows.length };
  });

  // Adds or removes a stand-in installed app and announces it, as AppService will (US-HOME-03 e2e, before phase 2).
  const fakeApp = z.object({
    id: z.string().regex(/^[a-z0-9-]{2,39}$/),
    name: z.string().optional(),
    remove: z.boolean().default(false),
    /** Any app state (default running); with `progress`, also an app.installProgress event. */
    state: z.enum(APP_STATES).default('running'),
    progress: z.number().min(0).max(100).optional(),
    /** Manifest `web.embed`: it opens in the app window (US-APP-01 e2e). */
    embed: z.boolean().default(false),
    /** `apps.state_detail`, e.g. a failed install's `{ code, port, step }` (US-STORE-13 e2e). */
    stateDetail: z.record(z.string(), z.unknown()).optional(),
    /** Its own port (12000–12999), for its fallback and tailnet addresses (US-SYS-04 e2e). */
    port: z.number().int().min(12000).max(12999).optional(),
    /** Folders on the storage root it uses, e.g. `users/<username>/Photos` (US-FILE-07 e2e: Open with). */
    mounts: z.array(z.string()).optional(),
    /** A stand-in for the built-in store's app at this older version: it has an update (US-STORE-15 e2e). */
    behind: z.string().optional(),
  });
  // The engine as stopped (or back), without touching the real one: e2e for the engine-stopped states (US-STATE-08…10).
  const engineBody = z.object({ running: z.boolean() });
  app.post('/dev/engine', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { running } = engineBody.parse(req.body);
    const status = await services.engine.simulateStop(!running);
    return { state: status.state };
  });

  // The pretend NAS (HLABS_DEV_FAKE_NAS): e2e takes it offline and back (US-FILE-12), and can forget its drives.
  const fakeNasBody = z.object({ online: z.boolean().default(true), forget: z.boolean().default(false) });
  app.post('/dev/fake-nas', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    if (!(services.discovery instanceof FakeNas)) return reply.code(404).send({ reason: 'HLABS_DEV_FAKE_NAS is off' });
    const { online, forget } = fakeNasBody.parse(req.body ?? {});
    services.discovery.online = online;
    if (forget) {
      services.db
        .delete(storageLocations)
        .where(and(eq(storageLocations.kind, 'smb'), eq(storageLocations.isRoot, false)))
        .run();
    }
    // Offline shows at once; coming back is left to Try again (or the next minute's check).
    if (!online) await services.networkDrives.check();
    return { online };
  });

  // Unused app images as e2e sees them (US-SYS-13): a pretend list, so a spec never removes a real image from the
  // engine it shares with a dev instance and other projects (D-168). `images: null` goes back to the engine's own.
  const fakeImagesBody = z.object({
    images: z.array(z.object({ id: z.string(), bytes: z.number().nonnegative() })).nullable(),
  });
  app.post('/dev/fake-images', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { images } = fakeImagesBody.parse(req.body);
    services.imagePruner.fake = images;
    return { images };
  });

  // Everyone's Trash as e2e sets it up (US-SYS-14): a file of `bytes` in a person's Trash (the first admin's when no
  // username is given), on this instance's own storage root.
  const fakeTrashBody = z.object({
    username: z.string().optional(),
    name: z.string().regex(/^[\w.-]{1,80}$/),
    bytes: z.number().int().nonnegative().max(100_000_000),
  });
  app.post('/dev/trash-item', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { username, name, bytes } = fakeTrashBody.parse(req.body);
    const person = services.db
      .select()
      .from(users)
      .where(username ? eq(users.username, username) : eq(users.role, 'admin'))
      .get();
    if (!person) return reply.code(404).send({ reason: 'no such person' });
    const root = services.db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get();
    if (!root) return reply.code(409).send({ reason: 'no storage root' });
    const dir = join(root.path, 'users', person.username);
    mkdirSync(dir, { recursive: true });
    const real = join(dir, name);
    writeFileSync(real, Buffer.alloc(bytes));
    const { id } = await services.trash.move({
      userId: person.id,
      locationId: root.id,
      real,
      virtual: `/home/${name}`,
    });
    return { id };
  });

  // The pretend Tailscale (HLABS_DEV_FAKE_TAILSCALE): e2e sets what it reports (US-SYS-02…04, US-ONB-17).
  const tailscaleBody = z.object({
    state: z.enum(['not_installed', 'stopped', 'needs_login', 'running']),
    tailnet: z.string().default('tail1234.ts.net'),
    nodeName: z.string().default('hlabs'),
    httpsEnabled: z.boolean().default(true),
    /** Log-ins finish at once, as if the person completed them in the other tab. */
    autoComplete: z.boolean().default(false),
    /** Writes refused, as without the Linux operator setting (D-104). */
    denyWrites: z.boolean().default(false),
    /** Ports something else already serves (D-103). */
    servedPorts: z.array(z.number().int()).default([]),
    /** The log-in page a log-in gives (e2e: never a real Tailscale page). */
    authUrl: z.string().default('about:blank'),
    /** Start remote access afresh (false: a log-in in progress finishes, as when the person signs in). */
    reset: z.boolean().default(true),
  });
  app.post('/dev/tailscale', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    if (!(services.tailscale instanceof FakeTailscale))
      return reply.code(409).send({ reason: 'not the fake Tailscale' });
    const b = tailscaleBody.parse(req.body);
    const ts = services.tailscale;
    ts.current =
      b.state === 'running'
        ? { kind: 'running', tailnet: b.tailnet, nodeName: b.nodeName, httpsEnabled: b.httpsEnabled, keyExpiry: null }
        : b.state === 'needs_login'
          ? { kind: 'needs_login', authUrl: null }
          : { kind: b.state };
    ts.autoComplete = b.autoComplete ? { tailnet: b.tailnet } : null;
    ts.denyWrites = b.denyWrites;
    ts.authUrl = b.authUrl;
    if (!b.reset) return { ok: true };
    ts.config = b.servedPorts.length
      ? { TCP: Object.fromEntries(b.servedPorts.map((p) => [String(p), { HTTPS: true }])) }
      : {};
    // A fresh start for remote access too.
    setSetting(services.db, 'remote', settingsSchemas.remote.parse(undefined));
    return { ok: true };
  });

  // The pretend Cloudflare (HLABS_DEV_FAKE_CLOUDFLARE): e2e sets how it behaves and can set public access up at once
  // (US-SYS-43, US-SYS-44, US-APP-27…29). Its zone is example.com, with example.com, www and mail taken already.
  const cloudflareBody = z.object({
    /** Nothing public and no tunnel, as on a fresh install (also clears the Visits log and refused addresses). */
    reset: z.boolean().default(false),
    /** Sign-ins are approved this long after they start, as if the person approved in Cloudflare's tab; null waits. */
    autoApprove: z.number().int().min(0).nullable().optional(),
    /** Approve the sign-in that's waiting now. */
    approve: z.boolean().default(false),
    /** The link "Sign in to Cloudflare" gives (never a real Cloudflare page in e2e). */
    signInUrl: z.string().optional(),
    /** Steps that fail: signIn, token, zone, tunnel, dns, connector, remove, access. */
    failing: z.array(z.enum(['signIn', 'token', 'zone', 'tunnel', 'dns', 'connector', 'remove', 'access'])).optional(),
    /**
     * The credential can't manage Cloudflare Access (US-SYS-48): "Add Cloudflare's sign-in in front" then asks for a
     * token, which only FAKE_CLOUDFLARE_ACCESS_TOKEN (`fake-cloudflare-access-token-0123456789`) satisfies.
     */
    accessDenied: z.boolean().optional(),
    /** More names already in the zone's DNS (records hlabs didn't make), e.g. `blog.example.com`. */
    takenNames: z.array(z.string()).optional(),
    /** Set up Cloudflare Tunnel straight away (as with an API token), by the first admin; waits for it. */
    setUp: z.boolean().default(false),
    /**
     * The dashboard public at `<hostname>.example.com` straight away (US-SYS-45), by the first admin without asking
     * for the password, waiting for the job (Cloudflare Tunnel must be set up, and every admin have two-factor); `null`
     * makes it private.
     */
    dashboard: z
      .object({ hostname: z.string().default('hlabs') })
      .nullable()
      .optional(),
  });
  const cloudflareState = (fake: FakeCloudflare) => ({
    domain: fake.domain,
    signingIn: fake.signingIn,
    records: [...fake.records.values()].map((r) => ({ name: r.name, byHlabs: r.byHlabs })),
    tunnels: [...fake.tunnels.values()],
    connector: fake.state(),
    calls: fake.calls,
    accessApps: [...fake.accessApps.values()].map((a) => ({ hostname: a.hostname, emails: a.emails })),
  });
  app.get('/dev/cloudflare', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    if (!(services.cloudflare instanceof FakeCloudflare))
      return reply.code(409).send({ reason: 'not the fake Cloudflare' });
    return cloudflareState(services.cloudflare);
  });
  app.post('/dev/cloudflare', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const fake = services.cloudflare;
    if (!(fake instanceof FakeCloudflare)) return reply.code(409).send({ reason: 'not the fake Cloudflare' });
    const b = cloudflareBody.parse(req.body ?? {});
    if (b.reset) {
      await services.publicApps.resetForDev();
      fake.reset();
      fake.autoApprove = null;
    }
    if (b.autoApprove !== undefined) fake.autoApprove = b.autoApprove;
    if (b.signInUrl !== undefined) fake.signInUrl = b.signInUrl;
    if (b.failing) fake.failing = new Set(b.failing);
    if (b.accessDenied !== undefined) fake.accessDenied = b.accessDenied;
    for (const name of b.takenNames ?? []) {
      const id = randomBytes(8).toString('hex');
      fake.records.set(id, { id, name, content: '192.0.2.10', byHlabs: false });
    }
    if (b.approve) fake.finishSignIn();
    if (b.setUp) {
      const admin = services.db.select().from(users).where(eq(users.role, 'admin')).get();
      const { jobId } = await services.publicApps.setupWithToken(
        { userId: admin?.id ?? null, role: 'admin', ip: null },
        fake.domain,
        FAKE_CLOUDFLARE_TOKEN,
      );
      await services.jobs.settled(jobId);
    }
    if (b.dashboard !== undefined) {
      const admin = services.db.select().from(users).where(eq(users.role, 'admin')).get();
      const { jobId } = await services.publicApps.setDashboardForDev(
        { userId: admin?.id ?? null, role: 'admin', ip: null },
        b.dashboard?.hostname ?? null,
      );
      const job = await services.jobs.settled(jobId);
      if (job?.state !== 'succeeded') return reply.code(409).send({ reason: job?.hlabsCode ?? job?.state ?? 'gone' });
    }
    return { ...cloudflareState(fake), dashboard: getSetting(services.db, 'public').dashboard?.hostname ?? null };
  });

  // The pretend Cloudflare's sign-in page (US-SYS-43 in development; its form posts as text/plain, a body the daemon
  // parses everywhere, where a urlencoded one would be refused with 415): what "Sign in to Cloudflare" opens under
  // `pnpm dev`, so setup can be tried by hand. Approve finishes the waiting sign-in with the fake's domain; closing the
  // tab and pressing Cancel in hlabs cancels it, as with the real one.
  const pretendPage = (title: string, body: string, service = 'Cloudflare') =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<title>${title}</title><style>body{font:16px system-ui,sans-serif;max-width:26rem;margin:4rem auto;padding:0 1rem;` +
    `color:#1b1433;background:#f6f4fb}h1{font-size:1.4rem}.note{font-size:.85rem;color:#5b5570}` +
    `button{font:inherit;font-weight:600;padding:.7rem 1.4rem;border:0;border-radius:999px;background:#1b1433;` +
    `color:#fff;cursor:pointer}code{background:#e9e4ff;padding:0 .3rem;border-radius:4px}</style></head>` +
    `<body><p class="note">Pretend ${service} · development only</p>${body}</body></html>`;
  const fakeFor = (reply: FastifyReply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) {
      void reply.code(503).send({ reason: 'starting' });
      return null;
    }
    if (!(services.cloudflare instanceof FakeCloudflare)) {
      void reply.code(409).send({ reason: 'not the fake Cloudflare' });
      return null;
    }
    return services.cloudflare;
  };
  app.get('/dev/cloudflare/sign-in', async (_req, reply) => {
    const fake = fakeFor(reply);
    if (!fake) return reply;
    const body = fake.signingIn
      ? `<h1>Allow hlabs to set up a tunnel?</h1><p>hlabs asks for a tunnel and DNS records on your domain ` +
        `<code>${fake.domain}</code>.</p><form method="post" enctype="text/plain" action="${FakeCloudflare.DEV_SIGN_IN_PATH}">` +
        `<button type="submit">Approve</button></form><p class="note">To cancel, close this tab and press Cancel in ` +
        `hlabs.</p>`
      : `<h1>Nothing is waiting</h1><p>Press “Sign in to Cloudflare” in hlabs first.</p>`;
    return reply.type('text/html; charset=utf-8').send(pretendPage('Sign in to Cloudflare', body));
  });
  app.post('/dev/cloudflare/sign-in', async (_req, reply) => {
    const fake = fakeFor(reply);
    if (!fake) return reply;
    const waiting = fake.signingIn;
    if (waiting) fake.finishSignIn();
    const body = waiting
      ? `<h1>Approved</h1><p>hlabs carries on with <code>${fake.domain}</code>. You can close this tab.</p>`
      : `<h1>Nothing is waiting</h1><p>Press “Sign in to Cloudflare” in hlabs first.</p>`;
    return reply.type('text/html; charset=utf-8').send(pretendPage('Sign in to Cloudflare', body));
  });

  // The pretend Tailscale's log-in page (US-SYS-02 in development): what "Connect" opens under `pnpm dev`, so
  // connecting can be tried by hand (never Tailscale's real site, where the pretend link is a 404). Approve signs this
  // computer in to the pretend tailnet; the settings row then turns Connected on its next check.
  const fakeTailscaleFor = (reply: FastifyReply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) {
      void reply.code(503).send({ reason: 'starting' });
      return null;
    }
    if (!(services.tailscale instanceof FakeTailscale)) {
      void reply.code(409).send({ reason: 'not the fake Tailscale' });
      return null;
    }
    return services.tailscale;
  };
  const nothingWaiting = `<h1>Nothing is waiting</h1><p>Press “Connect” in hlabs first.</p>`;
  app.get(FakeTailscale.DEV_SIGN_IN_PATH, async (_req, reply) => {
    const fake = fakeTailscaleFor(reply);
    if (!fake) return reply;
    const body = fake.signingIn
      ? `<h1>Add this device to your tailnet?</h1><p><code>${fake.hostname ?? 'hlabs'}</code> joins the pretend ` +
        `tailnet <code>tail1234.ts.net</code>.</p><form method="post" enctype="text/plain" ` +
        `action="${FakeTailscale.DEV_SIGN_IN_PATH}"><button type="submit">Approve</button></form>` +
        `<p class="note">To cancel, close this tab and press Cancel in hlabs.</p>`
      : nothingWaiting;
    return reply.type('text/html; charset=utf-8').send(pretendPage('Sign in to Tailscale', body, 'Tailscale'));
  });
  app.post(FakeTailscale.DEV_SIGN_IN_PATH, async (_req, reply) => {
    const fake = fakeTailscaleFor(reply);
    if (!fake) return reply;
    const waiting = fake.signingIn;
    if (waiting) fake.finishLogin();
    const body = waiting
      ? `<h1>Approved</h1><p>This computer is on the pretend tailnet. You can close this tab.</p>`
      : nothingWaiting;
    return reply.type('text/html; charset=utf-8').send(pretendPage('Sign in to Tailscale', body, 'Tailscale'));
  });

  // A line in the public listener's access log, as Caddy writes it (Visits, US-APP-29): development and e2e have no
  // Caddy in front.
  const visitBody = z.object({
    host: z.string(),
    path: z.string().default('/'),
    method: z.string().default('GET'),
    status: z.number().int().default(200),
    ip: z.string().default('203.0.113.24'),
    country: z.string().nullable().default('NL'),
    /** When (ms); now by default. */
    at: z.number().optional(),
    /** Where a redirect went (`/.hlabs/sign-in?next=/`). */
    location: z.string().optional(),
    /** The same line this many times, a second apart going back from `at`. */
    count: z.number().int().min(1).max(500).default(1),
  });
  app.post('/dev/public-visit', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const b = visitBody.parse(req.body ?? {});
    const at = b.at ?? Date.now();
    for (let i = b.count - 1; i >= 0; i--) {
      appendAccessLine(services.publicApps.logDir, {
        ts: (at - i * 1000) / 1000,
        status: b.status,
        request: {
          host: b.host,
          method: b.method,
          uri: b.path,
          client_ip: b.ip,
          headers: b.country ? { 'Cf-Ipcountry': [b.country] } : {},
        },
        resp_headers: b.location ? { Location: [b.location] } : {},
      });
    }
    return { ok: true };
  });

  app.post('/dev/fake-app', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const {
      id,
      name,
      remove,
      state,
      progress,
      embed,
      stateDetail: detail,
      port,
      mounts,
      behind,
    } = fakeApp.parse(req.body);
    const stateDetail = detail ? JSON.stringify(detail) : null;
    const { db, bus } = services;
    if (remove) {
      db.delete(apps).where(eq(apps.id, id)).run();
      // Only its own catalogue entry: a stand-in for a store app leaves the store's entry alone.
      db.delete(catalogApps)
        .where(and(eq(catalogApps.appId, id), eq(catalogApps.sourceId, 'dev')))
        .run();
      bus.emit('app.stateChanged', { appId: id, state: 'uninstalling', detail: 'removed' }, { kind: 'all' });
      return { removed: id };
    }
    db.insert(appSources)
      .values({ id: 'dev', kind: 'local', name: 'Development', url: 'dev:' })
      .onConflictDoNothing()
      .run();
    if (behind !== undefined) {
      db.insert(apps)
        .values({
          id,
          sourceId: 'builtin',
          version: behind,
          state,
          hostname: id,
          portFallback: port ?? null,
          installedAt: Date.now(),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({ target: apps.id, set: { state, version: behind, sourceId: 'builtin' } })
        .run();
      bus.emit('app.stateChanged', { appId: id, state, detail: null }, { kind: 'all' });
      return { added: id };
    }
    db.insert(catalogApps)
      .values({
        sourceId: 'dev',
        appId: id,
        version: '0.0.0',
        manifestJson: { name: name ?? id, web: { embed } },
        updatedAt: Date.now(),
        firstSeenAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
    db.insert(apps)
      .values({
        id,
        sourceId: 'dev',
        version: '0.0.0',
        state,
        stateDetail,
        hostname: id,
        portFallback: port ?? null,
        installedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({ target: apps.id, set: { state, stateDetail, updatedAt: Date.now() } })
      .run();
    const root = db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get();
    if (mounts && root) {
      db.delete(appMounts).where(eq(appMounts.appId, id)).run();
      for (const [i, subpath] of mounts.entries()) {
        db.insert(appMounts)
          .values({ id: ulid(), appId: id, target: `folder${i}`, storageLocationId: root.id, subpath })
          .run();
      }
    }
    bus.emit('app.stateChanged', { appId: id, state, detail: null }, { kind: 'all' });
    if (progress !== undefined) bus.emit('app.installProgress', { appId: id, jobId: 'dev', progress }, { kind: 'all' });
    return { added: id };
  });

  // An update that rolled back (US-STORE-17 e2e): its failed job and the admins' notification, as the job leaves them,
  // for a stand-in app; a real failing update needs an image that doesn't start.
  const rolledBackBody = z.object({
    id: z.string().regex(/^[a-z0-9-]{2,39}$/),
    name: z.string(),
    fromVersion: z.string(),
    toVersion: z.string(),
    restored: z.boolean().default(true),
  });
  app.post('/dev/rolled-back', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { id, name, fromVersion, toVersion, restored } = rolledBackBody.parse(req.body);
    const now = Date.now();
    services.db
      .insert(jobs)
      .values({
        id: ulid(),
        kind: 'app_update',
        target: id,
        state: 'failed',
        progress: 100,
        errorCode: restored ? 'APP_UPDATE_ROLLED_BACK' : 'APP_ROLLBACK_FAILED',
        payloadJson: { appId: id, userId: 'dev', fromVersion, toVersion },
        createdAt: now,
        finishedAt: now,
      })
      .run();
    return { notificationId: services.updates.notifyRolledBack({ appId: id, name, fromVersion, toVersion, restored }) };
  });

  // The built-in store read again from its folder (US-STORE-17 e2e): a spec adds a test app, or a newer version of it,
  // to the e2e instance's own copy of the store.
  app.post('/dev/sync-store', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    return services.catalog.syncBuiltin();
  });

  // Takes down and forgets an app a spec really installed (the US-STORE-11 smoke install), until uninstall arrives
  // with US-APP-12: marked failed, then removed as "Remove partial install" does.
  const removeApp = z.object({ id: z.string().regex(/^[a-z0-9-]{2,39}$/) });
  app.post('/dev/remove-app', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { id } = removeApp.parse(req.body);
    const { db } = services;
    if (!db.select().from(apps).where(eq(apps.id, id)).get()) return { removed: null };
    const admin = db.select().from(users).where(eq(users.role, 'admin')).get();
    db.update(apps).set({ state: 'install_failed' }).where(eq(apps.id, id)).run();
    await services.installer.removeFailed({ userId: admin?.id ?? 'dev', role: 'admin' }, id);
    return { removed: id };
  });

  // The docs screenshots' demo data set in one call (US-SITE-11, D-177), on the docs instance only (HLABS_DEV_DEMO):
  // Hari as the admin with two-factor on, data on this computer, then the family, apps, backups, usage and files of
  // src/demo/seed.ts. A finished setup is refused: it's for a fresh instance.
  app.post('/dev/demo', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { db, totp, onboarding, config } = services;
    if (!config.devDemo) return reply.code(409).send({ reason: 'HLABS_DEV_DEMO is off' });
    if (onboarding.completed) return reply.code(409).send({ reason: 'already set up' });
    asFreshInstall(db, 'account');
    const admin = DEMO_PEOPLE[0];
    const userId = await createAdmin(db, {
      username: admin.username,
      displayName: admin.displayName,
      password: 'demo-hari-password',
      ip: null,
      phase: config.phase,
    });
    const { secret } = totp.begin(userId);
    await totp.confirm(userId, generateSync({ secret }), { ip: null });
    onboarding.setStep('storage');
    await setStorageRoot(db, {
      userId,
      kind: 'local',
      name: 'This computer',
      path: config.paths.storageRootDefault,
      phase: config.phase,
    });
    await onboarding.complete({ userId, ip: null });
    return { userId, ...(await seedDemo(services, userId)) };
  });

  // hlabsd's clock (HLABS_DEV_CLOCK moves it), so a browser can be set to the same time (US-SITE-11).
  app.get('/dev/clock', async () => ({ now: Date.now() }));

  // A finished first run in one call, for e2e specs that aren't about onboarding: the admin (optionally with
  // two-factor on, as if during setup), data on this computer, onboarding complete. Returns the two-factor key and
  // recovery codes so specs can log in. Onboarding specs walk the real screens instead.
  const seedBody = z.object({
    username: z.string(),
    displayName: z.string(),
    password: z.string(),
    twoFactor: z.boolean().default(false),
    /** The web ports Caddy uses (the store matrix runs next to a dev instance on 80/443). */
    ports: z.object({ https: z.number().int(), http: z.number().int() }).optional(),
  });
  app.post('/dev/seed', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const input = seedBody.parse(req.body);
    const { db, totp, onboarding, config } = services;
    asFreshInstall(db, 'account', input.ports);
    const userId = await createAdmin(db, { ...input, ip: null, phase: config.phase });
    let secret: string | null = null;
    let recoveryCodes: string[] = [];
    if (input.twoFactor) {
      secret = totp.begin(userId).secret;
      recoveryCodes = await totp.confirm(userId, generateSync({ secret }), { ip: null });
    }
    onboarding.setStep('storage');
    await setStorageRoot(db, {
      userId,
      kind: 'local',
      name: 'This computer',
      path: config.paths.storageRootDefault,
      phase: config.phase,
    });
    await onboarding.complete({ userId, ip: null });
    return { userId, secret, recoveryCodes };
  });
}
