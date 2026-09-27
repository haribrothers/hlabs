// Where hlabs keeps its data on each platform (docs/prd/02-architecture.md §2.3, §2.8).
import { join } from 'node:path';

export interface PlatformPaths {
  /** Database, app compose projects, logs, engine files. */
  dataDir: string;
  /** Default storage root offered in onboarding (Home folders, Shared, media). */
  storageRootDefault: string;
  /** App data always stays on a local disk (D-011). */
  appDataDir: string;
}

export interface PlatformInfo {
  platform: NodeJS.Platform;
  home: string;
  /** Linux system service (no desktop session). */
  headless: boolean;
}

export function defaultPaths({ platform, home, headless }: PlatformInfo): PlatformPaths {
  if (platform === 'darwin') {
    return {
      dataDir: join(home, 'Library', 'Application Support', 'hlabs'),
      storageRootDefault: join(home, 'hlabs'),
      appDataDir: join(home, 'hlabs', 'app-data'),
    };
  }
  if (platform === 'linux' && headless) {
    return {
      dataDir: '/var/lib/hlabs',
      storageRootDefault: '/var/lib/hlabs/storage',
      appDataDir: '/var/lib/hlabs/app-data',
    };
  }
  if (platform === 'linux') {
    return {
      dataDir: join(home, '.local', 'share', 'hlabs'),
      storageRootDefault: join(home, 'hlabs'),
      appDataDir: join(home, 'hlabs', 'app-data'),
    };
  }
  throw new Error(`hlabs runs on macOS and Linux, not ${platform}`);
}
