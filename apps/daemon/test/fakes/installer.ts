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

  async download(url: string, dest: string, onBytes: (r: number, t: number | null) => void) {
    this.downloads.push(url);
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
    opts.onLine('INFO[0000] starting colima');
    await this.hold;
    opts.onLine('INFO[0042] done');
    this.onStarted();
  }
  async ping() {
    this.pings++;
    return this.pings > this.pingFailures;
  }
  async mkdir() {}
  async sleep() {}
}
