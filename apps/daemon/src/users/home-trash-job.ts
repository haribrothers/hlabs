// A deleted person's Home folder goes to the trash (US-ACCT-16): moved into the storage root's `.trash`, recorded in
// `trash_items` for the admin who deleted them. Emptying the trash after 30 days comes with the Trash (phase 8).
import { trashItems, users, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { JobRunner } from '../jobs/runner';
import { folderBytes } from '../storage/home-folder';

export interface HomeTrashPayload {
  /** `<root>/users/<username>` */
  path: string;
  username: string;
  /** The admin who deleted them: the trash item is theirs. */
  ownerUserId: string;
}

export function registerHomeFolderTrash(deps: { jobs: JobRunner; db: HlabsDb }): void {
  deps.jobs.register<HomeTrashPayload>('home_folder_trash', {
    async run({ payload, report }) {
      const exists = await access(payload.path).then(
        () => true,
        () => false,
      );
      if (!exists) return report(100);
      report(10);
      const size = await folderBytes(payload.path);
      const root = dirname(dirname(payload.path));
      const trashPath = join(root, '.trash', `${ulid()}-${payload.username}`);
      await mkdir(dirname(trashPath), { recursive: true });
      await rename(payload.path, trashPath);
      report(90);
      // The admin may be gone too by now; then there's no one to own the item, and the folder simply waits in .trash.
      if (deps.db.select({ id: users.id }).from(users).where(eq(users.id, payload.ownerUserId)).get()) {
        deps.db
          .insert(trashItems)
          .values({
            id: ulid(),
            ownerUserId: payload.ownerUserId,
            originalPath: `users/${payload.username}`,
            trashPath,
            deletedAt: Date.now(),
            size,
          })
          .run();
      }
      report(100);
    },
  });
}
