// The docs screenshots' demo data set (US-SITE-11, D-177), seeded through /dev/demo on the docs instance: the family,
// the apps of the design canvas with their store logos, remote access on, a backup history, usage history and a few
// files. Everything is made up and dated from "now" (the docs instance starts on a fixed day, HLABS_DEV_CLOCK), so the
// screenshots don't change from run to run. Never real people's data: this runs only on that instance's own data dir.
import {
  apps,
  appAccess,
  backupDestinations,
  backupPlan,
  backupRuns,
  catalogApps,
  setSetting,
  settingsSchemas,
  storageLocations,
  usageSamples,
  users,
} from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, eq } from 'drizzle-orm';
import { mkdir, truncate, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashPassword } from '../auth/passwords';
import { MANIFEST_COPY } from '../apps/service';
import { saveDock } from '../home/layout';
import type { Services } from '../services';
import { FakeTailscale } from '../tailscale/fake';
import { appValuesAt, DEMO_APPS, DEMO_PEOPLE, hostValuesAt, type DemoValues } from './figures';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const GB = 1e9;

/** The tailnet the demo's pretend Tailscale is on. */
export const DEMO_TAILNET = 'tail1234.ts.net';

export interface DemoSeedResult {
  people: string[];
  apps: string[];
  files: number;
}

/** Seeds everything after the admin exists and onboarding is done (the /dev/demo route makes those). */
export async function seedDemo(services: Services, adminId: string): Promise<DemoSeedResult> {
  const { db } = services;
  const now = Date.now();
  const today = Math.floor(now / DAY) * DAY;

  // The family: two members, sharing some of the apps.
  const memberIds = new Map<string, string>();
  for (const person of DEMO_PEOPLE) {
    if (person.role === 'admin') continue;
    const existing = db.select().from(users).where(eq(users.username, person.username)).get();
    const id = existing?.id ?? ulid();
    if (!existing) {
      db.insert(users)
        .values({
          id,
          username: person.username,
          displayName: person.displayName,
          role: 'member',
          passwordHash: await hashPassword(`demo-${person.username}-password`),
          createdAt: now - 40 * DAY,
          lastActiveAt: person.username === 'maya' ? now - DAY : now - 3 * HOUR,
        })
        .run();
    }
    memberIds.set(person.username, id);
  }
  db.update(users)
    .set({ createdAt: now - 60 * DAY, lastActiveAt: now })
    .where(eq(users.id, adminId))
    .run();

  // The apps, from the built-in store's listings (their names and logos); two a version behind, for Updates.
  for (const [i, app] of DEMO_APPS.entries()) {
    const listing = db
      .select()
      .from(catalogApps)
      .where(and(eq(catalogApps.sourceId, 'builtin'), eq(catalogApps.appId, app.id)))
      .get();
    if (!listing) continue;
    const version = app.update ?? listing.version;
    const installedAt = now - (50 - i * 6) * DAY;
    db.insert(apps)
      .values({
        id: app.id,
        sourceId: 'builtin',
        version,
        state: 'running',
        hostname: app.id,
        installedAt,
        updatedAt: installedAt,
        installedBy: adminId,
      })
      .onConflictDoUpdate({ target: apps.id, set: { version, state: 'running', sourceId: 'builtin' } })
      .run();
    // The manifest copy an installed app keeps (its revision, its settings), as an install writes it.
    const dir = services.apps.project(app.id).dir;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, MANIFEST_COPY), JSON.stringify({ ...(listing.manifestJson as object), version }));
    for (const username of app.sharedWith) {
      const userId = memberIds.get(username);
      if (userId) db.insert(appAccess).values({ appId: app.id, userId }).onConflictDoNothing().run();
    }
  }
  saveDock(db, { id: adminId, role: 'admin' }, ['jellyfin', 'immich', 'vaultwarden']);

  // Remote access on, through the pretend Tailscale.
  if (services.tailscale instanceof FakeTailscale) {
    services.tailscale.current = {
      kind: 'running',
      tailnet: DEMO_TAILNET,
      nodeName: 'hlabs',
      httpsEnabled: true,
      keyExpiry: null,
    };
  }
  setSetting(db, 'remote', {
    ...settingsSchemas.remote.parse(undefined),
    mode: 'tailscale',
    state: 'connected',
    tailnetName: DEMO_TAILNET,
    nodeName: 'hlabs',
    serve: [443],
  });

  await seedBackups(services, today);
  seedUsageHistory(services, now);
  const files = await seedFiles(services, now);
  return { people: DEMO_PEOPLE.map((p) => p.username), apps: DEMO_APPS.map((a) => a.id), files };
}

/** A NAS share backed up to every night at 03:00, with a month of runs: one failed when the NAS was away. */
async function seedBackups(services: Services, today: number) {
  const { db } = services;
  const locationId = ulid();
  // The share as if mounted: a folder that answers, so the drive check finds it there.
  const sharePath = join(services.config.paths.dataDir, 'demo-nas', 'Backups');
  await mkdir(sharePath, { recursive: true });
  db.insert(storageLocations)
    .values({
      id: locationId,
      kind: 'smb',
      name: 'Backups on nas',
      path: sharePath,
      mountOptions: JSON.stringify({ host: 'nas.local', share: 'Backups' }),
      isRoot: false,
      status: 'ok',
      lastSeenAt: today,
      appsAllowed: false,
    })
    .run();
  const destinationId = ulid();
  db.insert(backupDestinations)
    .values({
      id: destinationId,
      kind: 'smb',
      name: 'NAS',
      configJson: { type: 'network', locationId, folder: 'hlabs-backups' },
      repoPasswordRef: `backup-repo:${destinationId}`,
      status: 'ok',
      usedBytes: 38.2 * GB,
      snapshotCount: 42,
      createdAt: today - 45 * DAY,
    })
    .run();
  db.insert(backupPlan).values({ id: 1 }).onConflictDoNothing().run();
  const runs = Array.from({ length: 30 }, (_, i) => {
    const startedAt = today - i * DAY + 3 * HOUR;
    const failed = i === 9;
    const minutes = 4 + ((i * 7) % 4);
    return {
      id: ulid(startedAt),
      destinationId,
      startedAt,
      finishedAt: startedAt + (failed ? 2 : minutes) * MINUTE,
      status: failed ? ('failed' as const) : ('succeeded' as const),
      trigger: 'schedule' as const,
      bytesAdded: failed ? null : Math.round((0.4 + ((i * 37) % 11) / 10) * GB),
      filesChanged: failed ? null : 180 + ((i * 53) % 400),
      error: failed ? 'BACKUP_DEST_UNREACHABLE' : null,
      appCount: DEMO_APPS.length,
      folderCount: 4,
    };
  });
  db.insert(backupRuns).values(runs).run();
}

/** The usage history the charts draw: a day of minutes and a month of hours, for the computer and each app. */
function seedUsageHistory(services: Services, now: number) {
  const { db } = services;
  const row = (ts: number, resolution: '1m' | '1h', scope: string, v: DemoValues) => ({
    ts,
    resolution,
    scope,
    cpu: v.cpu,
    memBytes: Math.round(v.memBytes),
    netRx: Math.round(v.netRx),
    netTx: Math.round(v.netTx),
    diskRead: Math.round(v.diskRead),
    diskWrite: Math.round(v.diskWrite),
  });
  const rows: Array<ReturnType<typeof row>> = [];
  const lastMinute = Math.floor(now / MINUTE) * MINUTE - MINUTE;
  for (let ts = lastMinute - DAY; ts <= lastMinute; ts += MINUTE) {
    rows.push(row(ts, '1m', 'host', hostValuesAt(ts + MINUTE / 2)));
    for (const app of DEMO_APPS) rows.push(row(ts, '1m', app.id, appValuesAt(app, ts + MINUTE / 2)));
  }
  const lastHour = Math.floor(now / HOUR) * HOUR - HOUR;
  for (let ts = lastHour - 30 * DAY; ts <= lastHour; ts += HOUR) {
    rows.push(row(ts, '1h', 'host', hostValuesAt(ts + HOUR / 2)));
    for (const app of DEMO_APPS) rows.push(row(ts, '1h', app.id, appValuesAt(app, ts + HOUR / 2)));
  }
  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      tx.insert(usageSamples)
        .values(rows.slice(i, i + 500))
        .onConflictDoNothing()
        .run();
    }
  });
}

/** Made-up photos: soft gradients, as sharp renders them, in the colours of a trip. */
const PHOTOS: Array<{ name: string; from: string; to: string }> = [
  { name: 'Garden in spring.jpg', from: '#5b8c5a', to: '#f2e8cf' },
  { name: 'Sunset at the harbour.jpg', from: '#f28c5b', to: '#4b2c6b' },
  { name: 'Beach day.jpg', from: '#4ea8de', to: '#ffe8b6' },
  { name: 'Black sand beach.jpg', from: '#2b3a55', to: '#e6b89c' },
  { name: 'Glacier lagoon.jpg', from: '#7fb7d9', to: '#e8f4fb' },
  { name: 'Northern lights.jpg', from: '#0b1d2a', to: '#3ddc97' },
  { name: 'Waterfall.jpg', from: '#3f6b4f', to: '#cfe3d4' },
  { name: 'Hot springs.jpg', from: '#9ad1d4', to: '#f4efe6' },
];

/** A few folders and files in Hari's Home and the shared folder, with their dates in the past. */
async function seedFiles(services: Services, now: number): Promise<number> {
  const root = services.db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get();
  if (!root) return 0;
  const home = join(root.path, 'users', 'hari');
  const shared = join(root.path, 'shared');
  let count = 0;
  /** A file of `bytes` (sparse: big ones take no room), dated `daysAgo`. */
  const file = async (path: string, bytes: number, daysAgo: number, text?: string) => {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, text ?? '');
    if (!text) await truncate(path, bytes);
    const at = new Date(now - daysAgo * DAY);
    await utimes(path, at, at);
    count++;
  };
  const { default: sharp } = await import('sharp');
  for (const [i, photo] of PHOTOS.entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${photo.from}"/><stop offset="1" stop-color="${photo.to}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="${300 + i * 120}" cy="${260 + (i % 3) * 60}" r="${90 + i * 8}" fill="#ffffff" fill-opacity="0.18"/></svg>`;
    // The first three straight in Photos, the rest from a trip in a folder of their own.
    const path = join(home, 'Photos', ...(i < 3 ? [] : ['Iceland 2025']), photo.name);
    await mkdir(join(path, '..'), { recursive: true });
    await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toFile(path);
    const at = new Date(now - (120 + i) * DAY);
    await utimes(path, at, at);
    count++;
  }
  await file(join(home, 'Documents', 'Tax return 2025.pdf'), 1_240_000, 21);
  await file(join(home, 'Documents', 'Home insurance.pdf'), 860_000, 64);
  await file(join(home, 'Documents', 'Budget 2026.xlsx'), 48_000, 3);
  await file(join(home, 'Documents', 'Wi-Fi for guests.txt'), 0, 90, 'Network: Home\nAsk Hari for the password.\n');
  await file(join(home, 'Documents', 'Recipes', 'Sourdough.md'), 0, 12, '# Sourdough\n\n500 g flour, 350 g water.\n');
  await file(join(home, 'Downloads', 'Router manual.pdf'), 3_400_000, 30);
  await file(join(home, 'Downloads', 'Concert tickets.pdf'), 210_000, 2);
  await file(join(home, 'Music', 'Road trip', 'Track 01.mp3'), 7_800_000, 200);
  await file(join(home, 'Videos', 'Birthday party.mp4'), 1_850_000_000, 45);
  await file(join(shared, 'Movies', 'The Big Adventure (2019).mkv'), 4_200_000_000, 300);
  await file(join(shared, 'Movies', 'Ocean Deep (2021).mkv'), 3_100_000_000, 280);
  await file(join(shared, 'Family recipes.pdf'), 2_100_000, 150);
  for (const username of ['maya', 'leo']) await mkdir(join(root.path, 'users', username), { recursive: true });
  return count;
}
