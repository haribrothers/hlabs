// "What hlabs connects to" (US-SYS-29, 07 §7.1): every outside service hlabs talks to, from what is set up now, with
// when it was last contacted. Contacts are recorded in the `connections` setting by each client as it talks (the
// update check, the engine download, Tailscale, backup destinations), or read from where they're kept already (a store
// source's last sync, an image's pull time in `app_images`, the Pi-hole's last sync).
import type { Connection } from '@hlabs/api';
import { appImages, apps, appSources, backupDestinations, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPOSE_FILE } from '../apps/compose';

/** The `connections` keys written by the clients. */
export const CONTACT = {
  updateCheck: 'updateCheck',
  engineDownload: 'engineDownload',
  tailscale: 'tailscale',
  ntfy: 'ntfy',
  backup: (destinationId: string) => `backup:${destinationId}`,
} as const;

/** A client talked to its service now. Writes at most once a minute per service. */
export function recordContact(db: HlabsDb, key: string, at = Date.now()): void {
  const all = getSetting(db, 'connections');
  const last = all[key]?.lastContactAt;
  if (last !== undefined && at >= last && at - last < 60_000) return;
  setSetting(db, 'connections', { ...all, [key]: { lastContactAt: at } });
}

/** `ghcr.io/immich-app/server:v1` → ghcr.io; `jellyfin/jellyfin` and `nginx` → docker.io. */
export function registryOf(ref: string): string {
  const first = ref.split('/')[0] ?? '';
  if (ref.includes('/') && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    return first === 'index.docker.io' ? 'docker.io' : first;
  }
  return 'docker.io';
}

/** The images an app's compose file names. */
export function composeImages(text: string): string[] {
  return [...text.matchAll(/^\s*image:\s*["']?([^\s"'#]+)/gm)].map((m) => m[1]!);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export interface ConnectionsDeps {
  db: HlabsDb;
  /** Where the compose projects are (`<dataDir>/apps`). */
  projectsDir: string;
  /** The update manifest's host (github.com, or HLABS_UPDATE_ENDPOINT's). */
  updateHost: string;
  /** A backup destination's host or share, for people (null: not outside this computer). */
  destinationHost: (row: typeof backupDestinations.$inferSelect) => string | null;
}

export function listConnections(deps: ConnectionsDeps): Connection[] {
  const { db } = deps;
  const contacts = getSetting(db, 'connections');
  const contact = (key: string) => contacts[key]?.lastContactAt ?? null;
  const out: Connection[] = [];

  // App sources an admin added (the built-in store and folder libraries are on this computer).
  for (const s of db.select().from(appSources).all()) {
    if (s.kind !== 'git' && s.kind !== 'index') continue;
    out.push({
      id: `store:${s.id}`,
      kind: 'store',
      name: s.name,
      host: s.url,
      state: s.enabled ? 'on' : 'off',
      lastContactAt: s.lastSyncedAt ?? null,
    });
  }

  // Registries the installed apps' images come from; contacted when hlabs pulled one.
  const registries = new Map<string, number | null>();
  for (const app of db.select({ id: apps.id }).from(apps).all()) {
    let text: string;
    try {
      text = readFileSync(join(deps.projectsDir, app.id, COMPOSE_FILE), 'utf8');
    } catch {
      continue;
    }
    for (const ref of composeImages(text)) {
      const host = registryOf(ref);
      if (!registries.has(host)) registries.set(host, null);
    }
  }
  for (const img of db.select({ ref: appImages.ref, pulledAt: appImages.pulledAt }).from(appImages).all()) {
    const host = registryOf(img.ref);
    if (!registries.has(host)) continue;
    registries.set(host, Math.max(registries.get(host) ?? 0, img.pulledAt));
  }
  for (const [host, at] of [...registries].sort(([a], [b]) => a.localeCompare(b))) {
    out.push({ id: `registry:${host}`, kind: 'registry', name: null, host, state: 'on', lastContactAt: at });
  }

  out.push({
    id: 'updates',
    kind: 'updates',
    name: null,
    host: deps.updateHost,
    state: 'on',
    lastContactAt: contact(CONTACT.updateCheck),
  });

  const remote = getSetting(db, 'remote');
  if (remote.mode === 'tailscale') {
    out.push({
      id: 'tailscale',
      kind: 'tailscale',
      name: remote.tailnetName,
      host: 'controlplane.tailscale.com',
      state: remote.state === 'connected' ? 'on' : 'off',
      lastContactAt: contact(CONTACT.tailscale),
    });
  }

  for (const d of db.select().from(backupDestinations).all()) {
    const host = deps.destinationHost(d);
    if (!host) continue;
    out.push({
      id: `backup:${d.id}`,
      kind: 'backup',
      name: d.name,
      host,
      state: 'on',
      lastContactAt: contact(CONTACT.backup(d.id)),
    });
  }

  const ntfy = getSetting(db, 'notifications').ntfy;
  if (ntfy) {
    out.push({
      id: 'ntfy',
      kind: 'ntfy',
      name: null,
      host: hostOf(ntfy.server),
      state: 'on',
      lastContactAt: contact(CONTACT.ntfy),
    });
  }

  const dns = getSetting(db, 'network').dns;
  if (dns.kind === 'pihole' && dns.address) {
    out.push({
      id: 'pihole',
      kind: 'pihole',
      name: null,
      host: hostOf(dns.address),
      state: 'on',
      lastContactAt: dns.lastSyncAt,
    });
  }

  // The engine download (macOS, D-057): only once it has happened.
  const download = contact(CONTACT.engineDownload);
  if (download !== null) {
    out.push({
      id: 'engineDownload',
      kind: 'engineDownload',
      name: null,
      host: 'github.com',
      state: 'on',
      lastContactAt: download,
    });
  }
  return out;
}
