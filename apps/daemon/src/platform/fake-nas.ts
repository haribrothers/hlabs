// A pretend NAS for development and e2e behind HLABS_DEV_FAKE_NAS (CI has no NAS; US-FILE-11, US-FILE-12): one SMB
// server, "NAS" at nas.local, with the shares Media, Photos and Backups (folders in `<dataDir>/fake-nas`). Its password
// is "nas-password". /dev/fake-nas takes it offline and back.
import { hlabsError } from '@hlabs/api';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FoundServer, NetworkDiscovery } from './network-discovery';
import type { NetworkMounter, NetworkShare } from './network-mount';

export const FAKE_NAS_HOST = 'nas.local';
export const FAKE_NAS_PASSWORD = 'nas-password';
export const FAKE_NAS_SHARES = ['Media', 'Photos', 'Backups'];

export class FakeNas implements NetworkMounter, NetworkDiscovery {
  online = true;
  private readonly mounted = new Set<string>();

  constructor(private readonly root: string) {}

  async browse(): Promise<FoundServer[]> {
    return this.online ? [{ name: 'NAS', host: FAKE_NAS_HOST, protocol: 'smb', shares: [...FAKE_NAS_SHARES] }] : [];
  }

  async shares(protocol: 'smb' | 'nfs', host: string, login?: { username: string; password: string }) {
    if (!this.online || protocol !== 'smb' || host !== FAKE_NAS_HOST) return null;
    if (login && login.password !== FAKE_NAS_PASSWORD) throw hlabsError('NAS_AUTH_FAILED');
    return [...FAKE_NAS_SHARES];
  }

  async mount(share: NetworkShare, target: string): Promise<string> {
    if (!this.online || share.host !== FAKE_NAS_HOST || share.protocol !== 'smb') {
      throw hlabsError('NAS_UNREACHABLE', 'unreachable', { reason: 'unreachable' });
    }
    const name = share.share.replace(/^\/+/, '');
    if (!FAKE_NAS_SHARES.includes(name)) throw hlabsError('NAS_UNREACHABLE', 'noShare', { reason: 'noShare' });
    if (share.password !== FAKE_NAS_PASSWORD) throw hlabsError('NAS_AUTH_FAILED');
    const source = join(this.root, name);
    await mkdir(source, { recursive: true });
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    await symlink(source, target);
    this.mounted.add(target);
    return target;
  }

  async unmount(mountPoint: string) {
    this.mounted.delete(mountPoint);
    await rm(mountPoint, { force: true });
  }

  async isMounted(mountPoint: string) {
    return this.online && this.mounted.has(mountPoint);
  }
}
