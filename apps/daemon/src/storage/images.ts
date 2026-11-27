// Free space from unused app images (US-SYS-13, D-168). The engine is shared: with the person's own containers and
// images, other programs', and on a developer's Mac another hlabs. So an image is removed only when all of these hold:
// - hlabs pulled it for an app (an `app_images` row, written by the pull itself; never an image that was already on
//   the engine, never one found by a filter or a label);
// - no container on the engine uses it, of any project, running or stopped (asked again just before each removal);
// - no installed app's compose file names it (an app whose containers are down still needs its image);
// - it isn't the previous version of an app updated in the last 7 days (the rollback window, `.previous/digests.json`).
// Removal is by id through dockerode, never forced and never a prune: Docker itself still refuses an image a
// container uses, or one tagged for something else too. It runs as the `prune_images` job, one at a time with app
// jobs, so an install never loses the image it just found.
import { appImages, apps, auditLog, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { COMPOSE_FILE } from '../apps/compose';
import { SNAPSHOT_DIR } from '../apps/update';
import type { EngineService } from '../engine/service';
import type { ContainerEngine } from '../engine/types';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';

/** An app's previous version's images are kept this long after an update, so it can go back. */
export const ROLLBACK_WINDOW_MS = 7 * 24 * 60 * 60_000;

export interface Reclaimable {
  id: string;
  bytes: number;
}

export interface ImagePrunerDeps {
  db: HlabsDb;
  engine: Pick<EngineService, 'client'>;
  jobs: JobRunner;
  logger: Logger;
  /** An app's compose project folder. */
  projectDir: (appId: string) => string;
  now?: () => number;
}

/** The images a compose file names, or none when it can't be read. */
function composeImages(dir: string): string[] {
  try {
    const compose = parseYaml(readFileSync(join(dir, COMPOSE_FILE), 'utf8')) as {
      services?: Record<string, { image?: string }>;
    };
    return Object.values(compose.services ?? {}).flatMap((s) => (s.image ? [s.image] : []));
  } catch {
    return [];
  }
}

/** The image ids an update kept for going back: `{ service: "sha256:…" }`. */
function previousImages(dir: string): string[] {
  try {
    const digests = JSON.parse(readFileSync(join(dir, SNAPSHOT_DIR, 'digests.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    return Object.values(digests).filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

export class ImagePruner {
  /**
   * Development only (`POST /dev/fake-images`): what e2e sees as reclaimable instead of the engine's, and "removing"
   * them only takes them off this list. The real engine is never asked, so a spec can't remove a real image.
   */
  fake: Reclaimable[] | null = null;

  constructor(private readonly deps: ImagePrunerDeps) {}

  register() {
    this.deps.jobs.register<{ userId: string | null }>('prune_images', {
      run: async ({ payload, report }) => {
        const freedBytes = await this.prune(payload.userId, report);
        report(100, JSON.stringify({ freedBytes }));
      },
    });
  }

  /** Starts the job (US-SYS-13). */
  start(userId: string | null): { jobId: string } {
    return { jobId: this.deps.jobs.start('prune_images', { payload: { userId } }) };
  }

  /** The images that may go now, each with its size; none without an engine. */
  async reclaimable(): Promise<Reclaimable[]> {
    if (this.fake) return [...this.fake];
    const engine = this.deps.engine.client;
    if (!engine) return [];
    const recorded = [
      ...new Set(
        this.deps.db
          .select({ id: appImages.imageId })
          .from(appImages)
          .all()
          .map((r) => r.id),
      ),
    ];
    if (!recorded.length) return [];
    const keep = await this.kept(engine);
    const out: Reclaimable[] = [];
    for (const id of recorded) {
      if (keep.has(id)) continue;
      const info = await engine.imageInfo(id);
      if (!info) {
        // Gone already (removed by hand, or by Docker): nothing to free, and nothing to remember.
        this.deps.db.delete(appImages).where(eq(appImages.imageId, id)).run();
        continue;
      }
      out.push({ id: info.id, bytes: info.sizeBytes });
    }
    return out;
  }

  /** Bytes the job would free now; 0 when the engine can't say. */
  async reclaimableBytes(): Promise<number> {
    try {
      return (await this.reclaimable()).reduce((n, i) => n + i.bytes, 0);
    } catch (err) {
      this.deps.logger.warn({ err }, 'could not count unused images');
      return 0;
    }
  }

  /** Every image id that must stay: in use by any container, named by an installed app, or inside a rollback window. */
  private async kept(engine: ContainerEngine): Promise<Set<string>> {
    const keep = await engine.containerImageIds();
    const now = (this.deps.now ?? Date.now)();
    for (const app of this.deps.db.select().from(apps).all()) {
      const dir = this.deps.projectDir(app.id);
      for (const ref of composeImages(dir)) {
        const info = await engine.imageInfo(ref).catch(() => null);
        if (info) keep.add(info.id);
      }
      if (app.previousVersion && now - app.updatedAt < ROLLBACK_WINDOW_MS) {
        for (const id of previousImages(dir)) keep.add(id);
      }
    }
    return keep;
  }

  /** Removes what may go, one at a time, checking containers again before each; answers the bytes freed. */
  private async prune(userId: string | null, report: (progress: number) => void): Promise<number> {
    const candidates = await this.reclaimable();
    let freed = 0;
    let removed = 0;
    if (this.fake) {
      freed = candidates.reduce((n, i) => n + i.bytes, 0);
      removed = candidates.length;
      this.fake = [];
    } else {
      const engine = this.deps.engine.client;
      for (const [i, image] of candidates.entries()) {
        if (!engine) break;
        // Something may have started using it since the list was made.
        if ((await engine.containerImageIds()).has(image.id)) continue;
        await engine.removeImage(image.id).catch((err: unknown) => {
          this.deps.logger.warn({ err, image: image.id }, 'could not remove an unused image');
        });
        if ((await engine.imageInfo(image.id).catch(() => image)) === null) {
          freed += image.bytes;
          removed += 1;
          this.deps.db.delete(appImages).where(eq(appImages.imageId, image.id)).run();
        }
        report(((i + 1) / candidates.length) * 99);
      }
    }
    this.deps.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: (this.deps.now ?? Date.now)(),
        userId,
        action: 'storage.prune_images',
        target: null,
        detailJson: { count: removed, bytes: freed },
      })
      .run();
    return freed;
  }
}
