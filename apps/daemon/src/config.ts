// Daemon configuration from the environment, validated once at startup.
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { defaultPaths, type PlatformPaths } from './platform/paths';
import { defaultSecretStoreKind, type SecretStoreKind } from './platform/secrets';
import { VERSION } from './version';

const flag = z
  .enum(['0', '1', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HLABS_DATA_DIR: z.string().optional(),
  HLABS_PORT: z.coerce.number().int().min(0).max(65535).default(7474),
  HLABS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  HLABS_HEADLESS: flag,
  HLABS_DEV_ANONYMOUS_ADMIN: flag,
  HLABS_DEV_IGNORE_ENGINES: flag,
  HLABS_DEV_NO_ENGINE_INSTALL: flag,
  HLABS_DEV_NO_ENGINE_CONTROL: flag,
  HLABS_NETMOUNT_BIN: z.string().optional(),
  HLABS_PRIV_HELPER: z.string().optional(),
  HLABS_SECRET_STORE: z.enum(['keychain', 'file']).optional(),
  HLABS_DASHBOARD_URL: z.url().optional(),
  HLABS_STORE_DIR: z.string().optional(),
  HLABS_BIN_DIR: z.string().optional(),
  HLABS_WEB_FALLBACK_DIR: z.string().optional(),
  HLABS_PROXY: z.enum(['caddy', 'none']).optional(),
  HLABS_MDNS: z.enum(['0', '1', 'true', 'false']).optional(),
  HLABS_DASHBOARD_UPSTREAM: z.string().optional(),
});

declare const __HLABS_BUNDLE__: boolean | undefined;

/** Bundled files (the built-in store, caddy and docker-compose, the fallback page; D-076). In the bundle they sit next to
 * hlabsd.mjs; from source they are the repository's (`store/`, `.bin/` from `pnpm fetch-binaries`, the fallback
 * page build). */
export interface ResourcePaths {
  storeDir: string;
  binDir: string;
  webFallbackDir: string;
}

function defaultResources(): ResourcePaths {
  if (typeof __HLABS_BUNDLE__ !== 'undefined') {
    const here = dirname(fileURLToPath(import.meta.url));
    return {
      storeDir: resolve(here, 'store'),
      binDir: resolve(here, 'bin'),
      webFallbackDir: resolve(here, 'web-fallback'),
    };
  }
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  return {
    storeDir: resolve(repo, 'store'),
    binDir: resolve(repo, '.bin'),
    webFallbackDir: resolve(repo, 'apps/web/dist-fallback'),
  };
}

export interface DaemonConfig {
  version: string;
  env: 'development' | 'test' | 'production';
  dev: boolean;
  /** Always loopback: everything external goes through Caddy (02 §2.2). */
  host: '127.0.0.1';
  port: number;
  paths: PlatformPaths;
  resources: ResourcePaths;
  /** Caddy in front of the daemon and apps (D-006). Off for `pnpm dev` and tests; `pnpm dev:full` turns it on. */
  proxy: 'caddy' | 'none';
  /** Publish hlabs.local and each app's name with mDNS (02 §2.6). */
  mdns: boolean;
  /** Where Caddy sends dashboard pages: the daemon, or Vite under `pnpm dev:full`. */
  dashboardUpstream: string;
  /** Linux system service without a desktop session. */
  headless: boolean;
  /** Where the dashboard is opened from this computer; the setup URL is built from it (D-041). */
  dashboardUrl: string;
  /** macOS: the NetFS helper for SMB (D-060). */
  netmountHelper: string;
  /** Linux: the privileged helper for mounts (D-061). */
  privHelper: string;
  /** Keychain on a production desktop, encrypted file otherwise (07 §7.7). */
  secretStore: SecretStoreKind;
  logLevel: string;
  /** Phase 0 only: treat every request as a signed-in admin (see 05-api "From phase 0"). */
  devAnonymousAdmin: boolean;
  /** Development only: detect nothing but hlabs's own Colima, to try the install next to OrbStack (US-ONB-05). */
  devIgnoreEngines: boolean;
  /** Development and e2e: never download or start an engine (tests must not reach the internet, 11). */
  devNoEngineInstall: boolean;
  /** Development and e2e: engine restarts are pretended, so tests never restart the real engine. */
  devNoEngineControl: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const e = envSchema.parse(env);
  if (e.HLABS_DEV_ANONYMOUS_ADMIN && e.NODE_ENV === 'production') {
    throw new Error('HLABS_DEV_ANONYMOUS_ADMIN is for development only and is refused in production.');
  }
  if (e.HLABS_DEV_NO_ENGINE_INSTALL && e.NODE_ENV === 'production') {
    throw new Error('HLABS_DEV_NO_ENGINE_INSTALL is for development only and is refused in production.');
  }
  if (e.HLABS_DEV_NO_ENGINE_CONTROL && e.NODE_ENV === 'production') {
    throw new Error('HLABS_DEV_NO_ENGINE_CONTROL is for development only and is refused in production.');
  }
  if (e.HLABS_DEV_IGNORE_ENGINES && e.NODE_ENV === 'production') {
    throw new Error('HLABS_DEV_IGNORE_ENGINES is for development only and is refused in production.');
  }
  const platformPaths = defaultPaths({ platform: process.platform, home: homedir(), headless: e.HLABS_HEADLESS });
  const paths = e.HLABS_DATA_DIR
    ? {
        ...platformPaths,
        dataDir: resolve(e.HLABS_DATA_DIR),
        appDataDir: resolve(e.HLABS_DATA_DIR, 'app-data'),
        storageRootDefault: resolve(e.HLABS_DATA_DIR, 'storage'),
      }
    : platformPaths;
  const dev = e.NODE_ENV === 'development';
  const production = e.NODE_ENV === 'production';
  const resources = defaultResources();
  return {
    version: VERSION,
    env: e.NODE_ENV,
    dev,
    host: '127.0.0.1',
    port: e.HLABS_PORT,
    paths,
    resources: {
      storeDir: e.HLABS_STORE_DIR ? resolve(e.HLABS_STORE_DIR) : resources.storeDir,
      binDir: e.HLABS_BIN_DIR ? resolve(e.HLABS_BIN_DIR) : resources.binDir,
      webFallbackDir: e.HLABS_WEB_FALLBACK_DIR ? resolve(e.HLABS_WEB_FALLBACK_DIR) : resources.webFallbackDir,
    },
    proxy: e.HLABS_PROXY ?? (production ? 'caddy' : 'none'),
    mdns: e.HLABS_MDNS === undefined ? production : e.HLABS_MDNS === '1' || e.HLABS_MDNS === 'true',
    dashboardUpstream: e.HLABS_DASHBOARD_UPSTREAM ?? `127.0.0.1:${e.HLABS_PORT}`,
    headless: e.HLABS_HEADLESS,
    netmountHelper: e.HLABS_NETMOUNT_BIN ?? fileURLToPath(new URL('../native/.build/hlabs-netmount', import.meta.url)),
    privHelper: e.HLABS_PRIV_HELPER ?? '/usr/lib/hlabs/hlabs-priv',
    dashboardUrl: (e.HLABS_DASHBOARD_URL ?? `http://127.0.0.1:${e.HLABS_PORT}`).replace(/\/+$/, ''),
    secretStore: e.HLABS_SECRET_STORE ?? defaultSecretStoreKind({ env: e.NODE_ENV, headless: e.HLABS_HEADLESS }),
    logLevel: e.HLABS_LOG_LEVEL ?? (dev ? 'debug' : 'info'),
    devAnonymousAdmin: e.HLABS_DEV_ANONYMOUS_ADMIN,
    devIgnoreEngines: e.HLABS_DEV_IGNORE_ENGINES,
    devNoEngineInstall: e.HLABS_DEV_NO_ENGINE_INSTALL,
    devNoEngineControl: e.HLABS_DEV_NO_ENGINE_CONTROL,
  };
}
