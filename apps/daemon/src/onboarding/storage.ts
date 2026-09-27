// The storage root chosen in onboarding (US-ONB-14): Home folders, Shared and media live here; app data stays in
// appDataDir on this computer (D-011). Exactly one location is the root (04 invariant 4).
import { hlabsError } from '@hlabs/api';
import { getSetting, setSetting, storageLocations, users, type HlabsDb } from '@hlabs/db';
import { enabledOnboardingSteps, nextOnboardingStep, ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Creates the root's folders, reusing whatever is already there (never deletes). */
export async function prepareStorageRoot(root: string, username: string): Promise<void> {
  try {
    for (const dir of [join(root, 'users', username), join(root, 'shared'), join(root, '.trash')]) {
      await mkdir(dir, { recursive: true });
    }
    await access(root, constants.W_OK);
  } catch {
    throw hlabsError('STORAGE_NOT_WRITABLE', `${root} is not writable`);
  }
}

/** Keeps data on this computer: prepares the folders, registers the root and moves to the next enabled step. */
export async function setLocalStorage(db: HlabsDb, opts: { userId: string; path: string; now?: number }) {
  const steps = enabledOnboardingSteps() as string[];
  if (steps.indexOf(getSetting(db, 'onboarding').step) < steps.indexOf('storage')) {
    throw hlabsError('ONBOARDING_STEP_INVALID');
  }
  const user = db.select({ username: users.username }).from(users).where(eq(users.id, opts.userId)).get();
  if (!user) throw hlabsError('AUTH_REQUIRED');
  await prepareStorageRoot(opts.path, user.username);

  const now = opts.now ?? Date.now();
  db.transaction((tx) => {
    // Choosing again (after Back) replaces the earlier choice.
    tx.delete(storageLocations).where(eq(storageLocations.isRoot, true)).run();
    tx.insert(storageLocations)
      .values({ id: ulid(), kind: 'local', name: 'This computer', path: opts.path, isRoot: true, lastSeenAt: now })
      .run();
    const inTx = tx as unknown as HlabsDb;
    setSetting(inTx, 'onboarding', { ...getSetting(inTx, 'onboarding'), step: nextOnboardingStep('storage') });
  });
}
