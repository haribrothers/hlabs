// Daemon configuration from the environment, validated once at startup.
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';
import { defaultPaths, type PlatformPaths } from './platform/paths';
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
});

export interface DaemonConfig {
  version: string;
  env: 'development' | 'test' | 'production';
  dev: boolean;
  /** Always loopback: everything external goes through Caddy (02 §2.2). */
  host: '127.0.0.1';
  port: number;
  paths: PlatformPaths;
  logLevel: string;
  /** Phase 0 only: treat every request as a signed-in admin (see 05-api "From phase 0"). */
  devAnonymousAdmin: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const e = envSchema.parse(env);
  if (e.HLABS_DEV_ANONYMOUS_ADMIN && e.NODE_ENV === 'production') {
    throw new Error('HLABS_DEV_ANONYMOUS_ADMIN is for development only and is refused in production.');
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
  return {
    version: VERSION,
    env: e.NODE_ENV,
    dev,
    host: '127.0.0.1',
    port: e.HLABS_PORT,
    paths,
    logLevel: e.HLABS_LOG_LEVEL ?? (dev ? 'debug' : 'info'),
    devAnonymousAdmin: e.HLABS_DEV_ANONYMOUS_ADMIN,
  };
}
