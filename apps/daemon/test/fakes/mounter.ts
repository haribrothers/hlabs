import { hlabsError } from '@hlabs/api';
import { chmodSync, mkdirSync } from 'node:fs';
import type { NetworkMounter, NetworkShare } from '../../src/platform/network-mount';

/** "Mounts" by creating the target folder. `fail` makes it refuse like a NAS would; `readOnly` makes it unwritable. */
export class FakeMounter implements NetworkMounter {
  mounted = new Set<string>();
  shares: NetworkShare[] = [];
  fail: 'NAS_UNREACHABLE' | 'NAS_AUTH_FAILED' | null = null;
  readOnly = false;

  async mount(share: NetworkShare, target: string) {
    this.shares.push(share);
    if (this.fail) throw hlabsError(this.fail);
    mkdirSync(target, { recursive: true });
    if (this.readOnly) chmodSync(target, 0o555);
    this.mounted.add(target);
    return target;
  }
  async unmount(mountPoint: string) {
    chmodSync(mountPoint, 0o755);
    this.mounted.delete(mountPoint);
  }
}
