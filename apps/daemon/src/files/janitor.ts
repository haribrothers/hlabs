// Every hour (and at start): uploads with no chunk for 24 h go (US-FILE-09), and Trash older than 30 days (D-027).
import type { Logger } from '../logger';
import type { Trash } from './trash';
import type { Uploads } from './uploads';

export const JANITOR_MS = 60 * 60_000;

export class FilesJanitor {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: { uploads: Uploads; trash: Trash; logger: Logger }) {}

  async run(now = Date.now()) {
    try {
      await this.deps.uploads.sweep(now);
      await this.deps.trash.sweep(now);
    } catch (err) {
      this.deps.logger.warn({ err }, 'files clean-up failed');
    }
  }

  start(intervalMs = JANITOR_MS) {
    void this.run();
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
