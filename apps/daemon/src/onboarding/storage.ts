// The storage root chosen in onboarding (US-ONB-14): Home folders, Shared and media live here; app data stays in
// appDataDir on this computer (D-011). Exactly one location is the root (04 invariant 4).
import { hlabsError } from '@hlabs/api';
import { getSetting, setSetting, storageLocations, users, type HlabsDb } from '@hlabs/db';
import { enabledOnboardingSteps, nextOnboardingStep, ulid } from '@hlabs/shared';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveProbe } from '../platform/drives';

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

/**
 * Registers the storage root chosen in onboarding: prepares its folders, replaces any earlier choice (exactly one
 * root) and moves to the next enabled step.
 */
export async function setStorageRoot(
  db: HlabsDb,
  opts: { userId: string; kind: 'local' | 'external'; name: string; path: string; now?: number; phase?: number },
) {
  const steps = enabledOnboardingSteps(opts.phase) as string[];
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
      .values({ id: ulid(), kind: opts.kind, name: opts.name, path: opts.path, isRoot: true, lastSeenAt: now })
      .run();
    const inTx = tx as unknown as HlabsDb;
    setSetting(inTx, 'onboarding', {
      ...getSetting(inTx, 'onboarding'),
      step: nextOnboardingStep('storage', opts.phase),
    });
  });
}

/** An external drive (US-ONB-15): `<drive>/hlabs` becomes the root; app data stays on this computer (D-011). */
export async function setExternalStorage(
  db: HlabsDb,
  drives: DriveProbe,
  opts: { userId: string; path: string; phase?: number },
) {
  const drive = (await drives.externalDrives()).find((d) => d.path === opts.path && d.writable);
  if (!drive) throw hlabsError('NOT_FOUND', 'That drive is no longer connected');
  await setStorageRoot(db, {
    userId: opts.userId,
    kind: 'external',
    name: drive.name,
    path: join(drive.path, 'hlabs'),
    phase: opts.phase,
  });
}

/**
 * A network share added with storage.locations.addNetwork (US-ONB-16) becomes the root: the share itself holds
 * Home folders, Shared and media. App data stays on this computer (D-011).
 */
export async function setNetworkStorage(
  db: HlabsDb,
  opts: { userId: string; locationId: string; now?: number; phase?: number },
) {
  const steps = enabledOnboardingSteps(opts.phase) as string[];
  if (steps.indexOf(getSetting(db, 'onboarding').step) < steps.indexOf('storage')) {
    throw hlabsError('ONBOARDING_STEP_INVALID');
  }
  const location = db.select().from(storageLocations).where(eq(storageLocations.id, opts.locationId)).get();
  if (!location || (location.kind !== 'smb' && location.kind !== 'nfs')) throw hlabsError('NOT_FOUND');
  const user = db.select({ username: users.username }).from(users).where(eq(users.id, opts.userId)).get();
  if (!user) throw hlabsError('AUTH_REQUIRED');
  await prepareStorageRoot(location.path, user.username);

  db.transaction((tx) => {
    // An earlier local or external choice goes; other network locations stay, just not as the root.
    tx.delete(storageLocations)
      .where(and(eq(storageLocations.isRoot, true), inArray(storageLocations.kind, ['local', 'external'])))
      .run();
    tx.update(storageLocations).set({ isRoot: false }).where(ne(storageLocations.id, location.id)).run();
    tx.update(storageLocations).set({ isRoot: true }).where(eq(storageLocations.id, location.id)).run();
    const inTx = tx as unknown as HlabsDb;
    setSetting(inTx, 'onboarding', {
      ...getSetting(inTx, 'onboarding'),
      step: nextOnboardingStep('storage', opts.phase),
    });
  });
}
