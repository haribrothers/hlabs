import { hlabsError } from '@hlabs/api';
import type { InstallerHost } from '../../src/engine/colima-installer';
import { ENGINE_DOWNLOADS } from '../../src/engine/downloads';

/** Downloads, tar and colima without touching the network or the machine. */
export class FakeInstallerHost implements InstallerHost {
  downloads: string[] = [];
  runs: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
  /** Checksums returned per URL; defaults to the pinned ones. */
  checksums = new Map(
    Object.values(ENGINE_DOWNLOADS)
      .flat()
      .map((a) => [a.url, a.sha256]),
  );
  /** Pings that fail before the engine answers (Infinity: never). */
  pingFailures = 0;
  pings = 0;
  /** Called when `colima start` finishes (make the socket appear). */
  onStarted: () => void = () => {};
  /** Holds `colima start` until released (to observe a running install). */
  hold: Promise<void> = Promise.resolve();
  private files = new Map<string, string>();

  /** A download URL that stalls (ENGINE_DOWNLOAD_TIMEOUT). */
  stallUrl: string | null = null;
  /** `colima start` exits with an error. */
  failStart = false;
  /** Holds `colima delete` until released (to observe a retry during cleanup). */
  holdDelete: Promise<void> = Promise.resolve();

  async download(url: string, dest: string, onBytes: (r: number, t: number | null) => void) {
    this.downloads.push(url);
    if (url === this.stallUrl) throw hlabsError('ENGINE_DOWNLOAD_TIMEOUT', 'download timed out after 120s');
    this.files.set(dest, url);
    onBytes(50, 100);
    onBytes(100, 100);
  }
  async sha256(file: string) {
    return this.checksums.get(this.files.get(file) ?? '') ?? 'unknown';
  }
  async extract() {}
  async installBinary() {}
  async run(command: string, args: string[], opts: { env: NodeJS.ProcessEnv; onLine: (line: string) => void }) {
    this.runs.push({ command, args, env: opts.env });
    if (args[0] === 'delete') {
      await this.holdDelete;
      opts.onLine('INFO[0000] deleting colima');
      return;
    }
    opts.onLine('INFO[0000] starting colima');
    if (this.failStart) throw new Error('colima exited with code 1');
    await this.hold;
    opts.onLine('INFO[0042] done');
    this.onStarted();
  }
  async ping() {
    this.pings++;
    return this.pings > this.pingFailures;
  }
  async mkdir() {}
  /** Paths that exist (for cleanup checks). */
  existing = new Set<string>();
  /** What `list` returns per folder. */
  folders = new Map<string, string[]>();
  removed: string[] = [];
  async exists(path: string) {
    return this.existing.has(path);
  }
  async list(dir: string) {
    return this.folders.get(dir) ?? [];
  }
  async remove(path: string) {
    this.removed.push(path);
  }
  async sleep() {}
}
