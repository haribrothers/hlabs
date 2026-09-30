// hlabsd entry point.
import { boot, shutdown } from './boot';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { Readiness } from './readiness';
import { buildServer } from './server';
import { ServiceHolder } from './services';

const config = loadConfig();
const logger = createLogger(config);
if (config.devAnonymousAdmin)
  logger.warn('HLABS_DEV_ANONYMOUS_ADMIN is on: every request is treated as an admin (dev only)');

const readiness = new Readiness();
const holder = new ServiceHolder();
const app = await buildServer({ config, logger, readiness, holder });
await app.listen({ host: config.host, port: config.port });

const services = await boot({ config, logger, readiness, holder });

/** How long the server gets to close before shutdown carries on without it. */
const CLOSE_TIMEOUT_MS = 3_000;
let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  // Caddy and the mDNS publishers must be stopped whatever the server does, before anything can kill this process.
  await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS).unref())]);
  await shutdown(services);
  logger.info('stopped');
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
