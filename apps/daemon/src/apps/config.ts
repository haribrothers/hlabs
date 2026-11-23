// App settings › Configuration and Permissions (US-APP-13…19). `get` gives an app's variables (secrets masked: their
// values reach the browser only through `revealSecret`, audited), address, port, folders, devices and network access.
// `setConfig` and `setPermissions` check the change, keep the project's files and the settings as they were, save the
// new ones (audited, keys never values), render the project again and restart the app as an `app_config` job: if it
// isn't healthy within its health timeout, the previous files and settings come back and it starts on them. Its address
// moves with the state change (Caddy, mDNS, Tailscale Serve and DNS follow app.stateChanged). `setAuthMode` changes
// only the Caddy route, at once.
import { hlabsCodeOf, hlabsError, isReservedEnvName, type AppConfig } from '@hlabs/api';
import type { AppManifest } from '@hlabs/app-manifest';
import { appEnv, appMounts, apps, auditLog, getSetting, storageLocations, users, type HlabsDb } from '@hlabs/db';
import { HOSTNAME_PATTERN, ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineService } from '../engine/service';
import type { JobContext, JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NetworkService } from '../network/service';
import { tailnetHost } from '../network/domains';
import type { CatalogService } from '../store/catalog';
import { COMPOSE_FILE, ENV_FILE } from './compose';
import { isRequired, isSecret, resolveEnv } from './env';
import { resolveMounts, type MountRequest } from './folders';
import { waitHealthy, type HealthProbes } from './health';
import { takenHostnames } from './hostnames';
import type { InstallService, Installer } from './install';
import { APP_PORT_MAX, APP_PORT_MIN, loopbackPort, loopbackPortFree } from './ports';
import { SOURCE_COPY, type AppService } from './service';
import { stateDetail } from './state-machine';

/** The settings as they were, kept beside the project while the app restarts on new ones. */
export const PREVIOUS_SETTINGS_DIR = '.previous-settings';
const KEPT_FILES = [COMPOSE_FILE, ENV_FILE, SOURCE_COPY];
/** States settings can be saved from: the app is restarted (or started) on them. */
const FROM = new Set(['running', 'stopped', 'error']);

type EnvRow = typeof appEnv.$inferSelect;
type MountRow = typeof appMounts.$inferSelect;

/** What a job needs to put the settings back: no secret values (those are in the kept .env only). */
interface PreviousSettings {
  hostname: string;
  portFallback: number | null;
  netInternet: boolean;
  netApps: boolean;
  env: EnvRow[];
  mounts: MountRow[];
}

interface ConfigPayload {
  appId: string;
  user: Installer;
  previous: PreviousSettings;
  /** Network access changed: the stack is taken down first, so its networks are made again. */
  recreate: boolean;
}

export interface EnvEntry {
  key: string;
  /** Left out for a secret kept as it is. */
  value?: string;
  secret?: boolean;
}

export interface AppConfigDeps {
  db: HlabsDb;
  logger: Logger;
  jobs: JobRunner;
  catalog: CatalogService;
  apps: AppService;
  installer: Pick<InstallService, 'writeProject' | 'keptEnv' | 'storedMounts'>;
  engine: Pick<EngineService, 'client'>;
  network: Pick<NetworkService, 'sync'>;
  probes?: HealthProbes;
  isPortFree?: (port: number) => Promise<boolean>;
  now?: () => number;
}

const invalid = (key: string, reason: string) => hlabsError('VALIDATION_FAILED', `${key}: ${reason}`, { key, reason });

export class AppConfigService {
  constructor(private readonly deps: AppConfigDeps) {}

  register(): void {
    this.deps.jobs.register<ConfigPayload>('app_config', { run: (ctx) => this.run(ctx) });
  }

  /** `apps.getConfig` (admins): everything Configuration and Permissions show, secrets masked. */
  get(appId: string, viewer: { userId: string }): AppConfig {
    const { db } = this.deps;
    const app = this.app(appId);
    const manifest = this.manifest(appId);
    const rows = db.select().from(appEnv).where(eq(appEnv.appId, appId)).all();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const kept = this.deps.installer.keptEnv(appId);
    const env: AppConfig['env'] = [];
    for (const p of manifest.env) {
      const row = byKey.get(p.key);
      const secret = isSecret(p) || !!row?.isSecret;
      env.push({
        key: p.key,
        value: secret ? null : (row?.value ?? kept[p.key] ?? (p.default !== undefined ? String(p.default) : '')),
        secret,
        generated: !!p.generate,
        prompt: {
          label: p.label ?? null,
          description: p.description ?? null,
          type: p.type,
          options: p.options ?? null,
          hidden: !!p.hidden,
          required: isRequired(p),
        },
      });
    }
    const prompts = new Set(manifest.env.map((p) => p.key));
    for (const r of rows) {
      if (prompts.has(r.key)) continue;
      env.push({
        key: r.key,
        value: r.isSecret ? null : (r.value ?? ''),
        secret: r.isSecret,
        generated: false,
        prompt: null,
      });
    }

    const username = db.select({ u: users.username }).from(users).where(eq(users.id, viewer.userId)).get()?.u ?? '';
    const locations = new Map(
      db
        .select()
        .from(storageLocations)
        .all()
        .map((l) => [l.id, l]),
    );
    const folderByKey = new Map(manifest.folders.map((f) => [f.key, f]));
    const mounts = db.select().from(appMounts).where(eq(appMounts.appId, appId)).all();
    const folders: AppConfig['folders'] = mounts.flatMap((m) => {
      const location = locations.get(m.storageLocationId);
      if (!location) return [];
      const f = folderByKey.get(m.target);
      return [
        {
          target: m.target,
          storageLocationId: m.storageLocationId,
          subpath: m.subpath,
          mode: m.mode,
          ...placeOf(location, m.subpath, username),
          available: location.status === 'ok',
          folder: f
            ? { key: f.key, label: f.label, description: f.description ?? null, required: f.required, mode: f.mode }
            : null,
        },
      ];
    });
    const given = new Set(mounts.map((m) => m.target));
    const others = db.select({ id: apps.id, port: apps.portFallback }).from(apps).all();
    return {
      env,
      address: {
        hostname: app.hostname,
        domain: `${getSetting(db, 'hostname')}.local`,
        taken: takenHostnames(db).filter((h) => h !== app.hostname),
      },
      port: {
        hostPort: app.portFallback,
        containerPort: manifest.web.port,
        taken: others.flatMap((o) => (o.id !== appId && o.port !== null ? [o.port] : [])),
        tailnetHost: tailnetHost(db),
      },
      folders,
      folderRequests: manifest.folders
        .filter((f) => !given.has(f.key) && !f.default?.startsWith('appdata:'))
        .map((f) => ({ key: f.key, label: f.label, description: f.description ?? null, mode: f.mode })),
      devices: {
        gpu: manifest.permissions.gpu,
        list: manifest.permissions.devices.map((d) => ({ path: d.path, label: d.label })),
        capabilities: [...manifest.permissions.capabilities],
      },
      network: {
        internet: app.netInternet,
        apps: app.netApps,
        internetReason: manifest.permissions.internetReason ?? null,
      },
      auth: { mode: app.authMode, ownLogin: manifest.ownLogin },
    };
  }

  /** `apps.revealSecret` (admins): one secret's value from the app's .env, written to the audit log (key only). */
  revealSecret(user: Installer, appId: string, key: string): { value: string } {
    this.app(appId);
    const manifest = this.manifest(appId);
    const row = this.deps.db
      .select()
      .from(appEnv)
      .where(eq(appEnv.appId, appId))
      .all()
      .find((r) => r.key === key);
    const prompt = manifest.env.find((p) => p.key === key);
    const secret = !!row?.isSecret || (prompt ? isSecret(prompt) : false);
    if (!secret) throw hlabsError('NOT_FOUND', `${appId} has no secret ${key}`);
    const value = this.deps.installer.keptEnv(appId)[key];
    if (value === undefined) throw hlabsError('NOT_FOUND', `${appId}'s .env has no ${key}`);
    this.audit(user, 'app.revealSecret', appId, { key });
    return { value };
  }

  /** `apps.setAuthMode` (admins): the Caddy route gains or drops forward auth at once, no restart (US-APP-19). */
  async setAuthMode(user: Installer, appId: string, mode: 'hlabs' | 'none'): Promise<void> {
    const app = this.app(appId);
    if (app.authMode === mode) return;
    const at = (this.deps.now ?? Date.now)();
    this.deps.db.transaction((tx) => {
      tx.update(apps).set({ authMode: mode, updatedAt: at }).where(eq(apps.id, appId)).run();
      this.audit(user, 'app.setAuthMode', appId, { from: app.authMode, to: mode }, tx);
    });
    await this.deps.network.sync();
  }

  /**
   * `apps.setConfig` (admins): the whole list of variables, the address and the port (US-APP-13…16). Checked first
   * (nothing changes when something's wrong), then saved and the app restarted as a job.
   */
  async setConfig(
    user: Installer,
    appId: string,
    input: { env?: EnvEntry[]; hostname?: string; hostPort?: number },
  ): Promise<{ jobId: string }> {
    const { db } = this.deps;
    const app = this.assertCanApply(appId);
    const manifest = this.manifest(appId);
    const previous = this.previous(appId);
    const kept = this.deps.installer.keptEnv(appId);

    // Variables: prompts keep their names (and a generated secret its value); added ones are checked and new.
    let envRows: Array<{ key: string; value: string | null; isSecret: boolean }> | null = null;
    let values: Record<string, string> | null = null;
    const changedKeys = new Set<string>();
    if (input.env) {
      const prompts = new Map(manifest.env.map((p) => [p.key, p]));
      const seen = new Set<string>();
      const promptInput: Record<string, string> = {};
      const custom: Array<{ key: string; value: string; secret: boolean }> = [];
      const current = new Map(previous.env.map((r) => [r.key, r]));
      for (const e of input.env) {
        if (seen.has(e.key)) throw invalid(e.key, 'duplicate');
        seen.add(e.key);
        const prompt = prompts.get(e.key);
        if (prompt) {
          if (prompt.generate) {
            if (e.value !== undefined && e.value !== kept[e.key]) throw invalid(e.key, 'generated');
            continue;
          }
          if (e.value !== undefined) promptInput[e.key] = e.value;
          continue;
        }
        if (isReservedEnvName(e.key)) throw invalid(e.key, 'reserved');
        const was = current.get(e.key);
        const value = e.value ?? (was?.isSecret ? kept[e.key] : (was?.value ?? undefined));
        if (value === undefined)
          throw hlabsError('APP_ENV_INVALID', `${e.key}: required`, { key: e.key, reason: 'required' });
        custom.push({ key: e.key, value, secret: !!e.secret });
      }
      // Prompts left out keep their values; a secret prompt sent without a value too.
      const resolved = resolveEnv(manifest, promptInput, { ...kept, ...storedValues(previous.env) });
      values = { ...resolved, ...Object.fromEntries(custom.map((c) => [c.key, c.value])) };
      envRows = [
        ...manifest.env.map((p) => ({
          key: p.key,
          value: isSecret(p) ? null : resolved[p.key]!,
          isSecret: isSecret(p),
        })),
        ...custom.map((c) => ({ key: c.key, value: c.secret ? null : c.value, isSecret: c.secret })),
      ];
      const before = { ...kept, ...storedValues(previous.env) };
      for (const [key, value] of Object.entries(values)) if (before[key] !== value) changedKeys.add(key);
      for (const r of previous.env) if (!(r.key in values)) changedKeys.add(r.key);
      for (const r of envRows) if ((current.get(r.key)?.isSecret ?? r.isSecret) !== r.isSecret) changedKeys.add(r.key);
    }

    // Address and port (US-APP-15).
    const hostname = input.hostname ?? app.hostname;
    if (hostname !== app.hostname) {
      if (!HOSTNAME_PATTERN.test(hostname)) throw hlabsError('VALIDATION_FAILED', 'Bad address', { hostname });
      if (takenHostnames(db).includes(hostname)) throw hlabsError('HOSTNAME_TAKEN', undefined, { hostname });
    }
    const port = input.hostPort ?? app.portFallback;
    if (port !== app.portFallback && port !== null) await this.assertPortFree(appId, port, manifest.name);

    const at = (this.deps.now ?? Date.now)();
    db.transaction((tx) => {
      tx.update(apps).set({ hostname, portFallback: port, updatedAt: at }).where(eq(apps.id, appId)).run();
      if (envRows) {
        tx.delete(appEnv).where(eq(appEnv.appId, appId)).run();
        for (const r of envRows) {
          tx.insert(appEnv)
            .values({ appId, key: r.key, value: r.value, isSecret: r.isSecret, secretRef: r.isSecret ? 'env' : null })
            .run();
        }
      }
      // Keys only, never values (07 §7.7).
      this.audit(
        user,
        'app.setConfig',
        appId,
        {
          keys: [...changedKeys].sort(),
          ...(hostname !== app.hostname ? { hostname: { from: app.hostname, to: hostname } } : {}),
          ...(port !== app.portFallback ? { port: { from: app.portFallback, to: port } } : {}),
        },
        tx,
      );
    });
    return this.apply(user, appId, previous, values ?? undefined, false);
  }

  /**
   * `apps.setPermissions` (admins): folders and network access together, one restart (US-APP-17, US-APP-18). Folders
   * are checked like an install's, plus ones of its own at `/mnt/hlabs/<name>`; required ones can't go.
   */
  async setPermissions(
    user: Installer,
    appId: string,
    input: { mounts: MountRequest[]; network: { internet: boolean; apps: boolean } },
  ): Promise<{ jobId: string }> {
    const { db } = this.deps;
    const app = this.assertCanApply(appId);
    const manifest = this.manifest(appId);
    const previous = this.previous(appId);
    const same = (m: MountRequest) =>
      previous.mounts.some(
        (p) =>
          p.target === m.target &&
          p.storageLocationId === m.storageLocationId &&
          p.subpath === m.subpath &&
          (p.mode === m.mode || m.mode === 'ro'),
      );
    const mounts = await resolveMounts(
      db,
      manifest,
      input.mounts,
      { role: 'admin', username: '', canSeeShared: true },
      { extraFolders: true, unchanged: same },
    );
    // New folders are made by hlabs before the app starts (left to Docker, Linux makes them as root).
    for (const m of mounts) {
      if (same(m)) continue;
      try {
        mkdirSync(m.hostPath, { recursive: true });
      } catch (error) {
        throw hlabsError('STORAGE_NOT_WRITABLE', (error as Error).message, { folder: m.target });
      }
    }
    const recreate = input.network.internet !== app.netInternet || input.network.apps !== app.netApps;
    const at = (this.deps.now ?? Date.now)();
    db.transaction((tx) => {
      tx.update(apps)
        .set({ netInternet: input.network.internet, netApps: input.network.apps, updatedAt: at })
        .where(eq(apps.id, appId))
        .run();
      tx.delete(appMounts).where(eq(appMounts.appId, appId)).run();
      for (const m of mounts) {
        tx.insert(appMounts)
          .values({
            id: ulid(),
            appId,
            target: m.target,
            storageLocationId: m.storageLocationId,
            subpath: m.subpath,
            mode: m.mode,
          })
          .run();
      }
      this.audit(
        user,
        'app.setPermissions',
        appId,
        {
          mounts: mounts.map((m) => ({
            target: m.target,
            storageLocationId: m.storageLocationId,
            subpath: m.subpath,
            mode: m.mode,
          })),
          network: {
            from: { internet: app.netInternet, apps: app.netApps },
            to: input.network,
          },
        },
        tx,
      );
    });
    return this.apply(user, appId, previous, undefined, recreate);
  }

  /** Refuses with APP_BUSY, ENGINE_UNAVAILABLE or JOB_EXCLUSIVE_RUNNING before anything changes. */
  private assertCanApply(appId: string) {
    const app = this.app(appId);
    if (!FROM.has(app.state)) throw hlabsError('APP_BUSY', `${appId}: ${app.state}`, { appId, state: app.state });
    // Paused from the menu bar: apps stay stopped until resumed (US-INST-08).
    if (getSetting(this.deps.db, 'paused') !== null) {
      throw hlabsError('APP_BUSY', 'apps are paused', { appId, state: app.state, paused: true });
    }
    if (this.deps.jobs.listActive().some((j) => j.target === appId)) {
      throw hlabsError('APP_BUSY', `${appId} has a job going`, { appId, state: app.state });
    }
    this.deps.jobs.assertCanStart('app_config');
    if (!this.deps.engine.client) throw hlabsError('ENGINE_UNAVAILABLE');
    return app;
  }

  /** In 12000–12999, held by no other app and free on this computer, else APP_PORT_IN_USE (US-APP-15). */
  private async assertPortFree(appId: string, port: number, appName: string) {
    if (port < APP_PORT_MIN || port > APP_PORT_MAX) {
      throw hlabsError('VALIDATION_FAILED', `Port ${port} is outside 12000–12999`, { port });
    }
    const held = this.deps.db.select({ id: apps.id, port: apps.portFallback }).from(apps).all();
    const free = await (this.deps.isPortFree ?? loopbackPortFree)(loopbackPort(port));
    if (held.some((h) => h.port === port && h.id !== appId) || !free) {
      throw hlabsError('APP_PORT_IN_USE', `Port ${port} is in use`, { port, app: appName });
    }
  }

  /** The settings as they are now, for putting back. */
  private previous(appId: string): PreviousSettings {
    const { db } = this.deps;
    const app = this.app(appId);
    return {
      hostname: app.hostname,
      portFallback: app.portFallback,
      netInternet: app.netInternet,
      netApps: app.netApps,
      env: db.select().from(appEnv).where(eq(appEnv.appId, appId)).all(),
      mounts: db.select().from(appMounts).where(eq(appMounts.appId, appId)).all(),
    };
  }

  /**
   * Keeps the project's files as they are, renders it with the saved settings (and `values` for its .env, when the
   * variables changed) and starts the job; the app goes restarting (or starting) at once.
   */
  private apply(
    user: Installer,
    appId: string,
    previous: PreviousSettings,
    values: Record<string, string> | undefined,
    recreate: boolean,
  ): { jobId: string } {
    const dir = this.deps.apps.project(appId).dir;
    const kept = join(dir, PREVIOUS_SETTINGS_DIR);
    rmSync(kept, { recursive: true, force: true });
    mkdirSync(kept, { recursive: true, mode: 0o700 });
    for (const file of KEPT_FILES) {
      if (!existsSync(join(dir, file))) continue;
      copyFileSync(join(dir, file), join(kept, file));
      if (file === ENV_FILE) chmodSync(join(kept, file), 0o600);
    }
    try {
      this.render(appId, values);
    } catch (error) {
      this.restore(appId, previous);
      throw error;
    }
    const app = this.app(appId);
    const jobId = this.deps.jobs.start('app_config', {
      target: appId,
      payload: { appId, user, previous, recreate } satisfies ConfigPayload,
    });
    this.deps.apps.transition(appId, app.state === 'running' ? 'restarting' : 'starting');
    return { jobId };
  }

  /** Renders the project from the installed version's compose file with the saved settings. */
  private render(appId: string, values?: Record<string, string>) {
    const app = this.app(appId);
    const manifest = this.manifest(appId);
    const entry = this.deps.catalog.get(appId, app.sourceId ?? undefined);
    // The store's file for this version, else the one it was rendered from (the store has moved on).
    const compose =
      entry && entry.manifest.version === app.version ? entry.compose : this.deps.apps.sourceCompose(appId);
    if (!compose)
      throw hlabsError('APP_REINSTALL_UNAVAILABLE', `${appId} has no compose file`, { appId, missing: 'manifest' });
    const prompts = Object.fromEntries(manifest.env.map((p) => [p.key, true]));
    const kept = this.deps.installer.keptEnv(appId);
    const stored = this.deps.db.select().from(appEnv).where(eq(appEnv.appId, appId)).all();
    // The prompts' values: given, else as saved (secrets from the .env).
    const env = values
      ? Object.fromEntries(Object.entries(values).filter(([k]) => prompts[k]))
      : resolveEnv(manifest, {}, { ...kept, ...storedValues(stored) });
    const custom = values ? Object.fromEntries(Object.entries(values).filter(([k]) => !prompts[k])) : {};
    this.deps.installer.writeProject(
      manifest,
      compose,
      app.hostname,
      app.portFallback!,
      { ...env, ...custom },
      this.deps.installer.storedMounts(appId),
    );
  }

  /** The job: restart on the new settings; if it isn't healthy in time, put the previous ones back. */
  private async run(ctx: JobContext<ConfigPayload>): Promise<void> {
    const { appId, recreate } = ctx.payload;
    const name = this.manifest(appId).name;
    try {
      ctx.report(10, 'Restarting');
      await this.bringUp(appId, recreate, ctx.signal);
    } catch (error) {
      return this.undo(ctx, name, error);
    }
    rmSync(join(this.deps.apps.project(appId).dir, PREVIOUS_SETTINGS_DIR), { recursive: true, force: true });
    this.deps.apps.transition(appId, 'running');
    ctx.report(100, 'Restarted');
  }

  /** compose (down and) up, the address in step, then wait until healthy (APP_HEALTH_TIMEOUT when not). */
  private async bringUp(appId: string, recreate: boolean, signal?: AbortSignal) {
    const engine = this.deps.engine.client;
    if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
    if (recreate) await this.deps.apps.composeDown(appId);
    await this.deps.apps.composeUp(appId);
    await this.deps.network.sync();
    const health = await waitHealthy({
      engine,
      project: this.deps.apps.project(appId).name,
      manifest: this.manifest(appId),
      webPort: loopbackPort(this.app(appId).portFallback!),
      signal,
      probes: this.deps.probes,
    });
    if (!health.ok) {
      throw hlabsError(
        'APP_HEALTH_TIMEOUT',
        `${appId} wasn't healthy`,
        health.reason === 'timeout' ? { seconds: health.seconds } : { service: health.service, exited: true },
      );
    }
  }

  /**
   * The new settings didn't start it: the kept files and settings go back and it starts on them (US-APP-16). The job
   * fails with APP_CONFIG_UNDONE (or APP_PORT_IN_USE when the new port was taken), the app running again, or in error
   * when the previous settings didn't start it either.
   */
  private async undo(ctx: JobContext<ConfigPayload>, name: string, cause: unknown): Promise<never> {
    const { appId, previous, recreate } = ctx.payload;
    this.deps.logger.error({ err: cause, appId }, 'app settings did not start the app; putting the previous ones back');
    ctx.report(70, 'Undoing');
    const dir = this.deps.apps.project(appId).dir;
    const kept = join(dir, PREVIOUS_SETTINGS_DIR);
    for (const file of KEPT_FILES) {
      if (existsSync(join(kept, file))) copyFileSync(join(kept, file), join(dir, file));
    }
    chmodSync(join(dir, ENV_FILE), 0o600);
    this.restore(appId, previous);
    let back = true;
    try {
      await this.bringUp(appId, recreate, ctx.signal);
    } catch (error) {
      back = false;
      this.deps.logger.error({ err: error, appId }, 'the previous settings did not start the app either');
      this.deps.apps.transition(appId, 'error', stateDetail(hlabsCodeOf(error), { ...detailOf(error), app: name }));
    }
    if (back) this.deps.apps.transition(appId, 'running');
    rmSync(kept, { recursive: true, force: true });
    const code = hlabsCodeOf(cause);
    if (code === 'APP_PORT_IN_USE') {
      throw hlabsError('APP_PORT_IN_USE', `${appId}: the new port was taken`, { ...detailOf(cause), app: name, appId });
    }
    throw hlabsError('APP_CONFIG_UNDONE', `${appId}: new settings undone`, { app: name, appId });
  }

  /** The settings as they were (the kept .env holds the secrets). */
  private restore(appId: string, previous: PreviousSettings) {
    this.deps.db.transaction((tx) => {
      tx.update(apps)
        .set({
          hostname: previous.hostname,
          portFallback: previous.portFallback,
          netInternet: previous.netInternet,
          netApps: previous.netApps,
        })
        .where(eq(apps.id, appId))
        .run();
      tx.delete(appEnv).where(eq(appEnv.appId, appId)).run();
      for (const r of previous.env) tx.insert(appEnv).values(r).run();
      tx.delete(appMounts).where(eq(appMounts.appId, appId)).run();
      for (const m of previous.mounts) tx.insert(appMounts).values(m).run();
    });
  }

  private app(appId: string) {
    const app = this.deps.db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    return app;
  }

  private manifest(appId: string): AppManifest {
    try {
      return this.deps.apps.manifest(appId);
    } catch {
      throw hlabsError('NOT_FOUND', `${appId} has no project`);
    }
  }

  private audit(
    user: Installer,
    action: string,
    target: string,
    detail: Record<string, unknown>,
    tx: Pick<HlabsDb, 'insert'> = this.deps.db,
  ) {
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: (this.deps.now ?? Date.now)(),
        userId: user.userId,
        action,
        target,
        detailJson: detail,
        ip: user.ip ?? null,
      })
      .run();
  }
}

/** Plain values saved in SQLite (secrets aren't). */
function storedValues(rows: Array<{ key: string; value: string | null }>): Record<string, string> {
  return Object.fromEntries(rows.flatMap((r) => (r.value === null ? [] : [[r.key, r.value]])));
}

function detailOf(error: unknown): Record<string, unknown> {
  return (error as { cause?: { detail?: Record<string, unknown> } }).cause?.detail ?? {};
}

/**
 * Where a folder is, for people and the folder picker: the storage root's `users/<me>/…` is Home, `shared/…` Shared,
 * another person's Home their name; another drive by its name.
 */
export function placeOf(
  location: { id: string; name: string; isRoot: boolean },
  subpath: string,
  username: string,
): { place: AppConfig['folders'][number]['place']; filesPath: string } {
  const parts = subpath.split('/').filter(Boolean);
  if (location.isRoot && parts[0] === 'users' && parts[1]) {
    const rest = parts.slice(2).join('/');
    if (parts[1] === username) {
      return { place: { area: 'home', locationName: null, path: rest }, filesPath: rest ? `/home/${rest}` : '/home' };
    }
    return { place: { area: 'location', locationName: parts[1], path: rest }, filesPath: '/home' };
  }
  if (location.isRoot && parts[0] === 'shared') {
    const rest = parts.slice(1).join('/');
    return {
      place: { area: 'shared', locationName: null, path: rest },
      filesPath: rest ? `/shared/${rest}` : '/shared',
    };
  }
  return {
    place: { area: 'location', locationName: location.name, path: subpath },
    filesPath: location.isRoot ? '/home' : `/drives/${location.id}${subpath ? `/${subpath}` : ''}`,
  };
}
