// pino: JSON to a rotating file in <dataDir>/logs, pretty on stdout in development (01-tech-stack).
import { join } from 'node:path';
import pino, { type Logger } from 'pino';
import type { DaemonConfig } from './config';

export type { Logger };

export function createLogger(config: DaemonConfig): Logger {
  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-roll',
      level: config.logLevel,
      options: {
        file: join(config.paths.dataDir, 'logs', 'hlabsd.log'),
        size: '10m',
        limit: { count: 5 },
        mkdir: true,
      },
    },
  ];
  if (config.dev) targets.push({ target: 'pino-pretty', level: config.logLevel, options: { colorize: true } });
  return pino(
    {
      level: config.logLevel,
      base: { v: config.version },
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-hlabs-setup"]', '*.password'],
        censor: '[redacted]',
      },
    },
    pino.transport({ targets }),
  );
}

export const silentLogger = (): Logger => pino({ level: 'silent' });
