// The update marker (US-STATE-01, US-INST-20): the tray writes `<dataDir>/update-state.json` before it stops the
// daemon to replace hlabs. A daemon stopping with it there tells every page it's updating; one starting with it there
// reports steps 2–4 through /healthz, and removes it once ready.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const UPDATE_MARKER = 'update-state.json';

const markerSchema = z.object({
  fromVersion: z.string(),
  toVersion: z.string(),
  startedAt: z.number(),
  /** Why the new version didn't start, when it could tell (US-STATE-03): a later start reports it. */
  failedReason: z.string().optional(),
});
export type UpdateMarker = z.infer<typeof markerSchema>;

export const markerPath = (dataDir: string) => join(dataDir, UPDATE_MARKER);

export function readUpdateMarker(dataDir: string): UpdateMarker | null {
  try {
    const parsed = markerSchema.safeParse(JSON.parse(readFileSync(markerPath(dataDir), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The new version couldn't start (e.g. its migrations failed): kept in the marker for the next start to report. */
export function markUpdateFailed(dataDir: string, reason: string): void {
  const marker = readUpdateMarker(dataDir);
  if (!marker) return;
  try {
    writeFileSync(markerPath(dataDir), JSON.stringify({ ...marker, failedReason: reason }));
  } catch {
    // Reported without the reason.
  }
}

export const hasUpdateMarker = (dataDir: string) => existsSync(markerPath(dataDir));

export function clearUpdateMarker(dataDir: string): void {
  rmSync(markerPath(dataDir), { force: true });
}
