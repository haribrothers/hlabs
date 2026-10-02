// Pause and resume all apps from the menu bar (US-INST-08). Pausing remembers which apps were up (`settings.paused`)
// before stopping them (`compose stop`, data untouched), so an install that finishes meanwhile is stopped too and a
// restart keeps them stopped (reconcile skips autostart while paused). Resuming starts exactly those apps again.
// Caddy and the dashboard keep running. A backup in progress makes the pause wait (with backups, phase 5).
import { apps, auditLog, clearSetting, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { inArray } from 'drizzle-orm';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { AppService } from './service';

/** Apps that are up or on their way up. */
const UP = ['running', 'starting', 'restarting'] as const;
/** How long a pause waits for an app on its way up to settle before stopping it. */
const SETTLE_MS = 120_000;

export interface PauseDeps {
  db: HlabsDb;
  jobs: JobRunner;
  apps: AppService;
  logger: Logger;
  settleMs?: number;
  pollMs?: number;
}

export interface PausePayload {
  via?: 'tray';
}

function audit(db: HlabsDb, action: 'system.pause' | 'system.resume', appIds: string[], via?: 'tray') {
  db.insert(auditLog)
    .values({
      id: ulid(),
      at: Date.now(),
      userId: null,
      action,
      target: null,
      detailJson: { ...(via ? { via } : {}), appIds },
      ip: null,
    })
    .run();
}

export function isPaused(db: HlabsDb): boolean {
  return getSetting(db, 'paused') !== null;
}

/** An app an install just brought up while hlabs is paused: stop it and add it to the paused apps. */
export async function stopIfPaused(deps: Pick<PauseDeps, 'db' | 'apps'>, appId: string): Promise<void> {
  const paused = getSetting(deps.db, 'paused');
  if (!paused) return;
  setSetting(deps.db, 'paused', { ...paused, appIds: [...new Set([...paused.appIds, appId])] });
  await deps.apps.stop(appId);
}

export function registerPause(deps: PauseDeps): void {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  deps.jobs.register<PausePayload>('pause_all', {
    async run({ payload, report }) {
      const up = deps.db
        .select({ id: apps.id })
        .from(apps)
        .where(inArray(apps.state, [...UP]))
        .all()
        .map((a) => a.id);
      const earlier = getSetting(deps.db, 'paused');
      const appIds = [...new Set([...(earlier?.appIds ?? []), ...up])];
      // Recorded first, so a restart midway keeps them stopped and resume knows what to start.
      setSetting(deps.db, 'paused', { at: earlier?.at ?? Date.now(), appIds });
      audit(deps.db, 'system.pause', up, payload.via);
      for (const [i, appId] of up.entries()) {
        const deadline = Date.now() + (deps.settleMs ?? SETTLE_MS);
        // An app on its way up is let finish, then stopped.
        while (['starting', 'restarting'].includes(deps.apps.get(appId)?.state ?? '') && Date.now() < deadline) {
          await wait(deps.pollMs ?? 1_000);
        }
        if (deps.apps.get(appId)?.state === 'running') {
          await deps.apps.stop(appId).catch((err: unknown) => deps.logger.warn({ err, appId }, 'pause: stop failed'));
        }
        report(Math.round(((i + 1) / up.length) * 100));
      }
    },
  });

  deps.jobs.register<PausePayload>('resume_all', {
    async run({ payload, report }) {
      const paused = getSetting(deps.db, 'paused');
      clearSetting(deps.db, 'paused');
      const appIds = (paused?.appIds ?? []).filter((id) => {
        const state = deps.apps.get(id)?.state;
        return state === 'stopped' || state === 'error';
      });
      audit(deps.db, 'system.resume', appIds, payload.via);
      let done = 0;
      await Promise.all(
        appIds.map((appId) =>
          deps.apps
            .start(appId)
            .catch((err: unknown) => deps.logger.warn({ err, appId }, 'resume: start failed'))
            .finally(() => report(Math.round((++done / appIds.length) * 100))),
        ),
      );
    },
  });
}
