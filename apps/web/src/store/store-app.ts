// What a store card shows for an app (US-STORE-01): its tags, and its one button, from the catalogue entry plus the
// installed app (apps.list) and install progress (events).
import type { AppRouter, StoreApp } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import { storeCopy, tagLabels } from '../copy/store';

export type StoreHost = inferRouterOutputs<AppRouter>['store']['getHome']['host'];
export type InstalledApp = inferRouterOutputs<AppRouter>['apps']['list']['apps'][number];

/** "Apple Silicon" (or "ARM64") when this computer and the app are arm64, then the manifest tags we know. */
export function storeTags(app: StoreApp, host: StoreHost): string[] {
  const platform = host.arm64 && app.arm64 ? [storeCopy.arm64Tag[host.os]] : [];
  return [...platform, ...app.tags.flatMap((t) => (tagLabels[t] ? [tagLabels[t]] : []))];
}

export type CardAction =
  | { kind: 'install' }
  | { kind: 'open'; url: string }
  | { kind: 'installing'; percent: number }
  /** Installed, but not an app this person can open (a member). */
  | { kind: 'installed' };

/**
 * Not installed → "Install" (to the details page, so access is seen first). Installing → "Installing… N%". Installed
 * and openable → "Open". A failed install goes back to "Install" (its details lead to the failure, US-STORE-13).
 */
export function cardAction(
  app: StoreApp,
  installed: InstalledApp | undefined,
  progress: number | undefined,
  location: Pick<Location, 'hostname'> = window.location,
): CardAction {
  if (installed) {
    if (installed.state === 'installing') return { kind: 'installing', percent: Math.round(progress ?? 0) };
    if (installed.state === 'install_failed') return { kind: 'install' };
    const url =
      location.hostname.endsWith('.ts.net') && installed.urls.tailnet ? installed.urls.tailnet : installed.urls.local;
    return { kind: 'open', url };
  }
  return app.installed ? { kind: 'installed' } : { kind: 'install' };
}
