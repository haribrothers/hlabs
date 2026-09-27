// The real InstallerHost: fetch, SHA-256, tar and child processes (macOS only, D-057).
import { hlabsError } from '@hlabs/api';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { DockerodeEngine } from './dockerode-engine';
import type { InstallerHost } from './colima-installer';

/** A download that sends nothing for this long is given up (ENGINE_DOWNLOAD_TIMEOUT). */
const STALL_MS = 120_000;

export function nodeInstallerHost(): InstallerHost {
  return {
    async download(url, dest, onBytes, signal) {
      const stall = new AbortController();
      let timer = setTimeout(() => stall.abort(), STALL_MS);
      const both = AbortSignal.any([signal, stall.signal]);
      try {
        const res = await fetch(url, { signal: both, redirect: 'follow' });
        if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length')) || null;
        let received = 0;
        const count = new Transform({
          transform(chunk: Buffer, _enc, done) {
            received += chunk.length;
            clearTimeout(timer);
            timer = setTimeout(() => stall.abort(), STALL_MS);
            onBytes(received, total);
            done(null, chunk);
          },
        });
        await pipeline(Readable.fromWeb(res.body as never), count, createWriteStream(dest), { signal: both });
      } catch (err) {
        if (stall.signal.aborted && !signal.aborted) {
          throw hlabsError('ENGINE_DOWNLOAD_TIMEOUT', `download timed out after ${STALL_MS / 1000}s`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },

    async sha256(file) {
      const hash = createHash('sha256');
      await pipeline(createReadStream(file), hash);
      return hash.digest('hex');
    },

    async extract(archive, dir, signal) {
      await promisify(execFile)('/usr/bin/tar', ['-xzf', archive, '-C', dir], { signal });
    },

    async installBinary(file, dest) {
      await copyFile(file, dest);
      await chmod(dest, 0o755);
    },

    run(command, args, { env, signal, onLine }) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, { env, signal, stdio: ['ignore', 'pipe', 'pipe'] });
        for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', onLine);
        child.once('error', reject);
        child.once('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`${basename(command)} exited with code ${code ?? 'unknown'}`)),
        );
      });
    },

    ping: (socketPath) => new DockerodeEngine(socketPath).ping(),
    mkdir: (dir) => mkdir(dir, { recursive: true }).then(() => undefined),
    exists: (path) =>
      access(path).then(
        () => true,
        () => false,
      ),
    list: (dir) => readdir(dir).catch(() => []),
    remove: (path) => rm(path, { recursive: true, force: true }),
    sleep: (ms, signal) => delay(ms, undefined, { signal }),
  };
}
