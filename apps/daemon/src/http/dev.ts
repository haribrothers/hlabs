import { notificationActionsSchema, onboardingStepSchema, severitySchema } from '@hlabs/api';
import {
  APP_STATES,
  apps,
  appSources,
  catalogApps,
  getSetting,
  loginAttempts,
  setSetting,
  settingsSchemas,
  storageLocations,
  users,
} from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { generateSync } from 'otplib';
import { hashPassword } from '../auth/passwords';
import { createAdmin } from '../onboarding/create-admin';
import { prepareStorageRoot, setStorageRoot } from '../onboarding/storage';
import { cookieDomain, sessionCookie } from '../auth/sessions';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServiceHolder } from '../services';

/** Development-only routes. Never registered in production. */
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

  // First-run gate in e2e (US-ONB-01): the setup URL the daemon printed, and a shortcut past onboarding
  // until the onboarding stories that complete it are built.
  app.get('/dev/setup-url', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    return { url: await services.onboarding.setupUrl() };
  });

  // Puts onboarding back at a step, as a fresh first run: users (and so their sessions) and log-in attempts are
  // removed, and the
  // setup token is kept or made again (e2e specs start from a known state).
  const resetBody = z.object({ step: onboardingStepSchema.default('welcome') }).default({ step: 'welcome' });
  app.post('/dev/reset-onboarding', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { step } = resetBody.parse(req.body ?? undefined);
    services.db.delete(users).run();
    services.db.delete(loginAttempts).run();
    setSetting(services.db, 'onboarding', { ...getSetting(services.db, 'onboarding'), completedAt: null, step });
    // As a fresh install: setup leaves the startup switches on (US-SYS-20), whatever an earlier run changed.
    setSetting(services.db, 'startup', settingsSchemas.startup.parse(undefined));
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

  app.post('/dev/fake-app', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { id, name, remove, state, progress, embed, stateDetail: detail } = fakeApp.parse(req.body);
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
        installedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({ target: apps.id, set: { state, stateDetail, updatedAt: Date.now() } })
      .run();
    bus.emit('app.stateChanged', { appId: id, state, detail: null }, { kind: 'all' });
    if (progress !== undefined) bus.emit('app.installProgress', { appId: id, jobId: 'dev', progress }, { kind: 'all' });
    return { added: id };
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

  // A finished first run in one call, for e2e specs that aren't about onboarding: the admin (optionally with
  // two-factor on, as if during setup), data on this computer, onboarding complete. Returns the two-factor key and
  // recovery codes so specs can log in. Onboarding specs walk the real screens instead.
  const seedBody = z.object({
    username: z.string(),
    displayName: z.string(),
    password: z.string(),
    twoFactor: z.boolean().default(false),
  });
  app.post('/dev/seed', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const input = seedBody.parse(req.body);
    const { db, totp, onboarding, config } = services;
    db.delete(users).run();
    db.delete(loginAttempts).run();
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), completedAt: null, step: 'account' });
    // As a fresh install: setup leaves the startup switches on (US-SYS-20), whatever an earlier run changed.
    setSetting(db, 'startup', settingsSchemas.startup.parse(undefined));
    const userId = await createAdmin(db, { ...input, ip: null });
    let secret: string | null = null;
    let recoveryCodes: string[] = [];
    if (input.twoFactor) {
      secret = totp.begin(userId).secret;
      recoveryCodes = await totp.confirm(userId, generateSync({ secret }), { ip: null });
    }
    onboarding.setStep('storage');
    await setStorageRoot(db, { userId, kind: 'local', name: 'This computer', path: config.paths.storageRootDefault });
    await onboarding.complete({ userId, ip: null });
    return { userId, secret, recoveryCodes };
  });
}
