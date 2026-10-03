// The update marker (US-STATE-01, US-INST-20): the tray writes `<dataDir>/update-state.json` before it stops the
// daemon to replace hlabs. A daemon stopping with it there tells every page it's updating; one starting with it there
// reports steps 2–4 through /healthz, and removes it once ready.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const UPDATE_MARKER = 'update-state.json';

const markerSchema = z.object({ fromVersion: z.string(), toVersion: z.string(), startedAt: z.number() });
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

export const hasUpdateMarker = (dataDir: string) => existsSync(markerPath(dataDir));

export function clearUpdateMarker(dataDir: string): void {
  rmSync(markerPath(dataDir), { force: true });
}
