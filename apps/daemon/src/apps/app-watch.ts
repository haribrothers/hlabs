// Noticing apps that stop working (US-APP-26, D-127). Every 10 s the containers of each running app are looked at.
// Docker restarts a crashed container by itself (`restart: unless-stopped`), so a short blip is left alone; the app
// is `error` when a container stays down for 30 s, is restarted 3 times within 5 minutes, or reports `unhealthy` for
// 60 s. Only apps in `running` are watched, so exits hlabs causes (stop, restart, update, pause, uninstall) never
// count, and nothing is looked at while the engine is away. The admins get one "<App> stopped working" per crash: it's
// marked read once the app runs again (restarted, or back by itself) or is uninstalled, so the next crash is told
// too. An app that comes back by itself and stays up and healthy for 60 s is running again, and that's said too.
import { apps, type HlabsDb } from '@hlabs/db';
import { inArray } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineService } from '../engine/service';
import type { ContainerState } from '../engine/types';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import type { NotificationService } from '../notifications/service';
import { MANIFEST_COPY, type AppService } from './service';
import { stateDetail, type StateDetail } from './state-machine';

export const WATCH_MS = 10_000;
/** A container down this long (Docker didn't bring it back) is a crash. */
export const DOWN_MS = 30_000;
/** This many restarts by Docker within the window is a crash loop. */
export const LOOP_RESTARTS = 3;
export const LOOP_WINDOW_MS = 5 * 60_000;
export const UNHEALTHY_MS = 60_000;
/** Up and healthy this long after a crash: working again. */
export const RECOVER_MS = 60_000;

export const CRASHED_KIND = 'app.crashed';
export const RECOVERED_KIND = 'app.recovered';
/** The state_detail codes this watcher sets; only apps in `error` with one of these can recover by themselves. */
export const CRASH_CODES: ReadonlySet<string> = new Set(['APP_CRASHED', 'APP_UNHEALTHY']);

export interface AppWatchDeps {
  db: HlabsDb;
  apps: Pick<AppService, 'get' | 'transition' | 'project' | 'services' | 'manifest'>;
  engine: Pick<EngineService, 'client'>;
  notifications: Pick<NotificationService, 'create' | 'hasUnread' | 'markKindRead'>;
  bus: Pick<EventBus, 'on'>;
  logger: Logger;
}

interface ServiceTrack {
  /** When it was first seen down (not running), null while up. */
  downSince: number | null;
  unhealthySince: number | null;
  /** Docker's restart count when last seen; null before the first look. */
  restarts: number | null;
  /** When each restart Docker made was seen, within the loop window. */
  restartedAt: number[];
}

interface AppTrack {
  /** The state it was watched in; a different state starts afresh. */
  state: 'running' | 'error';
  services: Map<string, ServiceTrack>;
  /** Up and healthy since, for an app in error after a crash. */
  healthySince: number | null;
}

type Crash =
  | { code: 'APP_CRASHED'; service: string; exitCode: number | null; oom: boolean; loop: boolean }
  | { code: 'APP_UNHEALTHY'; service: string };

export class AppWatch {
  private readonly tracks = new Map<string, AppTrack>();
  private timer: NodeJS.Timeout | null = null;
  private checking: Promise<void> | null = null;

  constructor(private readonly deps: AppWatchDeps) {
    // The crash is over once the app runs again or goes: its notification (and toast) with it.
    deps.bus.on(({ event }) => {
      if (event.type !== 'app.stateChanged') return;
      if (event.data.state === 'running' || event.data.state === 'uninstalling') {
        deps.notifications.markKindRead(CRASHED_KIND, Date.now(), event.data.appId);
      }
    });
  }

  start(intervalMs = WATCH_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.check(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One look at every running app, and every app in error after a crash; never two at once. */
  check(now = Date.now()): Promise<void> {
    this.checking ??= this.look(now)
      .catch((err: unknown) => this.deps.logger.warn({ err }, 'app watch failed'))
      .finally(() => (this.checking = null));
    return this.checking;
  }

  private async look(now: number): Promise<void> {
    const engine = this.deps.engine.client;
    if (!engine) {
      // Nothing to judge while the engine is away (US-STATE-08); start afresh when it's back.
      this.tracks.clear();
      return;
    }
    const watched = this.deps.db
      .select({ id: apps.id, state: apps.state, stateDetail: apps.stateDetail })
      .from(apps)
      .where(inArray(apps.state, ['running', 'error']))
      .all()
      .filter((a) => a.state === 'running' || CRASH_CODES.has(parseDetail(a.stateDetail)?.code ?? ''));
    const ids = new Set(watched.map((a) => a.id));
    for (const id of this.tracks.keys()) if (!ids.has(id)) this.tracks.delete(id);

    for (const app of watched) {
      // A dev stand-in or a project that's gone has no containers to judge (reconcile leaves it as it is too).
      if (!existsSync(join(this.deps.apps.project(app.id).dir, MANIFEST_COPY))) continue;
      const state = app.state as 'running' | 'error';
      let track = this.tracks.get(app.id);
      if (!track || track.state !== state) {
        track = { state, services: new Map(), healthySince: null };
        this.tracks.set(app.id, track);
      }
      let containers: ContainerState[];
      try {
        containers = await engine.projectContainers(this.deps.apps.project(app.id).name);
      } catch {
        continue; // the engine went away mid-look: judged next time
      }
      const expected = this.deps.apps.services(app.id);
      const services = expected.length ? expected : [...new Set(containers.map((c) => c.service))];
      if (state === 'running') this.watchRunning(app.id, track, services, containers, now);
      else this.watchRecovery(app.id, track, services, containers, now);
    }
  }

  private watchRunning(appId: string, track: AppTrack, services: string[], containers: ContainerState[], now: number) {
    let crash: Crash | null = null;
    for (const service of services) {
      const c = containers.find((x) => x.service === service);
      const t = track.services.get(service) ?? {
        downSince: null,
        unhealthySince: null,
        restarts: null,
        restartedAt: [],
      };
      track.services.set(service, t);
      const count = c?.restartCount ?? 0;
      if (t.restarts !== null) for (let i = t.restarts; i < count; i++) t.restartedAt.push(now);
      t.restarts = count;
      t.restartedAt = t.restartedAt.filter((at) => now - at < LOOP_WINDOW_MS);
      const up = c?.state === 'running';
      t.downSince = up ? null : (t.downSince ?? now);
      t.unhealthySince = up && c?.health === 'unhealthy' ? (t.unhealthySince ?? now) : null;

      const exit = { service, exitCode: c?.exitCode ?? null, oom: c?.oomKilled === true };
      if (t.restartedAt.length >= LOOP_RESTARTS) crash = { code: 'APP_CRASHED', ...exit, loop: true };
      else if (t.downSince !== null && now - t.downSince >= DOWN_MS)
        crash = { code: 'APP_CRASHED', ...exit, loop: false };
      else if (t.unhealthySince !== null && now - t.unhealthySince >= UNHEALTHY_MS) {
        crash = { code: 'APP_UNHEALTHY', service };
      }
      if (crash) break;
    }
    if (crash) this.stoppedWorking(appId, crash, now);
  }

  private watchRecovery(appId: string, track: AppTrack, services: string[], containers: ContainerState[], now: number) {
    const healthy =
      services.length > 0 &&
      services.every((service) => {
        const c = containers.find((x) => x.service === service);
        return c?.state === 'running' && (c.health === null || c.health === 'healthy');
      });
    track.healthySince = healthy ? (track.healthySince ?? now) : null;
    if (track.healthySince !== null && now - track.healthySince >= RECOVER_MS) this.workingAgain(appId, now);
  }

  private stoppedWorking(appId: string, crash: Crash, now: number) {
    const { code, ...params } = crash;
    try {
      this.deps.apps.transition(appId, 'error', stateDetail(code, params));
    } catch {
      return; // it moved on meanwhile (stopped, restarting…): not a crash
    }
    this.tracks.delete(appId);
    this.deps.logger.warn({ appId, ...crash }, 'app stopped working');
    if (this.deps.notifications.hasUnread(CRASHED_KIND, appId)) return;
    const name = this.name(appId);
    this.deps.notifications.create({
      userId: null,
      kind: CRASHED_KIND,
      target: appId,
      severity: 'warning',
      title: `${name} stopped working`,
      body: crashReason(crash),
      actions: [
        { kind: 'mutation', procedure: 'apps.restart', input: { appId }, label: 'Restart' },
        { kind: 'navigate', to: `/apps/${appId}/logs` },
      ],
      now,
    });
  }

  private workingAgain(appId: string, now: number) {
    try {
      this.deps.apps.transition(appId, 'running');
    } catch {
      return;
    }
    this.tracks.delete(appId);
    this.deps.logger.info({ appId }, 'app is working again');
    this.deps.notifications.markKindRead(CRASHED_KIND, now, appId);
    this.deps.notifications.create({
      userId: null,
      kind: RECOVERED_KIND,
      target: appId,
      severity: 'success',
      title: `${this.name(appId)} is working again`,
      now,
    });
  }

  private name(appId: string): string {
    try {
      return this.deps.apps.manifest(appId).name;
    } catch {
      return appId;
    }
  }
}

/** The notification's line about what happened. */
export function crashReason(crash: Crash): string {
  if (crash.code === 'APP_UNHEALTHY') return 'It stopped answering.';
  if (crash.oom) return 'It ran out of memory.';
  if (crash.loop) return `It quit unexpectedly ${LOOP_RESTARTS} times in 5 minutes.`;
  return 'It quit unexpectedly.';
}

function parseDetail(detail: string | null): StateDetail | null {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as StateDetail;
  } catch {
    return null;
  }
}
