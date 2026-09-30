// The helper processes the daemon starts and must outlive no daemon: Caddy and the mDNS publishers. Each is written to
// a file while it runs, so when a daemon is killed before it can stop them (a crash, SIGKILL, a dev restart), the next
// daemon ends them at start. Left running they hold port 443 and the .local names, and a second Caddy shares the port
// with a stale config. A recorded process is ended only if its command still carries the marker it was recorded with,
// so a reused process id is never touched.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Entry {
  pid: number;
  /** Text the process's command line contains (its config file, its name). */
  marker: string;
}

/** The command line of a running process, or null when it isn't running. */
function commandOf(pid: number): string | null {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

export class ChildRegistry {
  private entries: Entry[] = [];

  constructor(
    private readonly file: string,
    private readonly deps: {
      commandOf?: (pid: number) => string | null;
      kill?: (pid: number, signal: NodeJS.Signals) => void;
    } = {},
  ) {}

  /** Ends the processes a previous daemon left running, and starts a fresh record. Returns how many were ended. */
  reapStale(): number {
    let stale: Entry[] = [];
    try {
      stale = JSON.parse(readFileSync(this.file, 'utf8')) as Entry[];
    } catch {
      // Nothing recorded.
    }
    let ended = 0;
    for (const { pid, marker } of stale) {
      const command = (this.deps.commandOf ?? commandOf)(pid);
      if (!command?.includes(marker)) continue;
      try {
        (this.deps.kill ?? process.kill)(pid, 'SIGTERM');
        ended++;
      } catch {
        // Already gone.
      }
    }
    this.entries = [];
    this.write();
    return ended;
  }

  add(pid: number | undefined, marker: string): void {
    if (pid === undefined) return;
    this.entries.push({ pid, marker });
    this.write();
  }

  remove(pid: number | undefined): void {
    if (pid === undefined) return;
    this.entries = this.entries.filter((e) => e.pid !== pid);
    this.write();
  }

  private write() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, JSON.stringify(this.entries), { mode: 0o600 });
  }
}
