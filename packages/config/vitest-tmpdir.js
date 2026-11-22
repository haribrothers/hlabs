// One temp folder per test run. Every worker's os.tmpdir() points inside it, so the folders tests and the code under
// test make there (a daemon's data dir per test, fake stores, drives, restic repos) go when the run ends instead of
// piling up in the system temp folder. A run killed before its teardown, and Vitest's own module copies, are swept by
// a later run once they are a day old.
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIX = 'hlabs-test-';
const STALE_MS = 24 * 60 * 60 * 1000;

/** Some tests make folders read-only (to check how a failure reads), which stops a plain recursive remove. */
function makeWritable(path) {
  try {
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) return;
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeWritable(join(path, name));
  } catch {
    // Best effort: whatever is left is reported by the second remove below.
  }
}

function remove(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    makeWritable(path);
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`Couldn't remove the test temp folder ${path}: ${error.message}`);
    }
  }
}

/** When it was last written, if `path` is a folder Vitest 5.0.2 leaves behind: its root instance copies transformed
 * modules to `<tmpdir>/<nanoid>/<client|ssr>/<sha1>` (made before this setup runs) and never removes them. Anything
 * else, including other programs' folders with similar names, returns undefined. */
function vitestLeftoverMtime(path, name) {
  if (!/^[A-Za-z0-9_-]{21}$/.test(name)) return undefined;
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) return undefined;
    const envs = readdirSync(path, { withFileTypes: true });
    if (envs.length === 0) return undefined;
    let mtime = stat.mtimeMs;
    for (const env of envs) {
      if (!env.isDirectory() || !['client', 'ssr'].includes(env.name)) return undefined;
      const envPath = join(path, env.name);
      if (!readdirSync(envPath).every((file) => /^[0-9a-f]{40}$/.test(file))) return undefined;
      mtime = Math.max(mtime, statSync(envPath).mtimeMs);
    }
    return mtime;
  } catch {
    return undefined;
  }
}

function sweepStale(base) {
  const now = Date.now();
  for (const name of readdirSync(base)) {
    const path = join(base, name);
    const mtime = name.startsWith(PREFIX)
      ? statSync(path, { throwIfNoEntry: false })?.mtimeMs
      : vitestLeftoverMtime(path, name);
    if (mtime !== undefined && now - mtime > STALE_MS) remove(path);
  }
}

export default function setup() {
  const base = tmpdir();
  sweepStale(base);

  const dir = mkdtempSync(join(base, PREFIX));
  const previous = process.env.TMPDIR;
  // Set before the workers start, so they (and anything they spawn) inherit it.
  process.env.TMPDIR = dir;

  return () => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    remove(dir);
  };
}
