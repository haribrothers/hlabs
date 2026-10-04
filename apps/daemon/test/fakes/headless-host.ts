import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HeadlessHost } from '../../src/updates/headless';

/** Downloads are files from `files` (by URL); unpacking writes a marker file; restarts are counted. */
export class FakeHeadlessHost implements HeadlessHost {
  files = new Map<string, string>();
  restarts = 0;
  failDownload = false;
  async download(url: string, dest: string) {
    if (this.failDownload) throw new Error('fetch failed');
    copyFileSync(this.files.get(url)!, dest);
  }
  async extract(_tarball: string, dir: string) {
    writeFileSync(join(dir, 'hlabsd'), 'new version');
  }
  restart() {
    this.restarts++;
  }
}
