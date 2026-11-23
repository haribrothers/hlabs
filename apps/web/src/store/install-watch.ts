// Installs started from a phone's install sheet and not yet finished (US-PHONE-12): PhoneInstallFailed shows a
// failure among them as a sheet.
import { useSyncExternalStore } from 'react';

/** Installs started from this phone and not yet finished. */
let watched: readonly string[] = [];
const listeners = new Set<() => void>();
const publish = (next: readonly string[]) => {
  watched = next;
  for (const l of listeners) l();
};

/** Started from the install sheet on a phone: a failure is shown here. */
export function watchInstall(appId: string) {
  if (!watched.includes(appId)) publish([...watched, appId]);
}
export const unwatch = (appId: string) => publish(watched.filter((id) => id !== appId));

export function useWatched() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => watched,
    () => watched,
  );
}
