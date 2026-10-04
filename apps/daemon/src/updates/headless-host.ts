// The real HeadlessHost: fetch, tar, and a clean stop that systemd turns into a start of the new `current`
// (Restart=always, D-118).
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { HeadlessHost } from './headless';

export function nodeHeadlessHost(): HeadlessHost {
  return {
    async download(url, dest, signal) {
      const res = await fetch(url, { redirect: 'follow', signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest), { signal });
    },
    async extract(tarball, dir) {
      await promisify(execFile)('tar', ['-xzf', tarball, '-C', dir]);
    },
    restart() {
      // The SIGTERM handler shuts down cleanly; systemd then starts the version `current` points at.
      process.kill(process.pid, 'SIGTERM');
    },
  };
}
