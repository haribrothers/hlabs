// "Copy diagnostics" (US-INST-12): a plain-text report to paste into a bug report. hlabs's and the OS's versions, the
// engine, what /healthz says and the last 200 lines of the daemon's log, with secrets removed; no container logs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { arch, release } from 'node:os';
import { join } from 'node:path';
import type { DaemonConfig } from '../config';
import type { EngineService } from '../engine/service';
import type { Readiness } from '../readiness';

export const LOG_LINES = 200;
export const REDACTED = '[redacted]';

/** Bearer tokens, setup and invite tokens in URLs, cookies and anything that looks like a password or secret. */
export function redactSecrets(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:token|key|secret|password)=)[^&\s"']+/gi, `$1${REDACTED}`)
    .replace(
      /("(?:[a-zA-Z]*(?:password|secret|token|cookie|authorization|apiKey)[a-zA-Z]*)"\s*:\s*)"[^"]*"/gi,
      `$1"${REDACTED}"`,
    )
    .replace(/((?:hlabs_session|session)=)[^;\s"]+/gi, `$1${REDACTED}`);
}

/** The newest daemon log file (pino-roll numbers them hlabsd.1.log, hlabsd.2.log…). */
export function newestLog(logsDir: string): string | null {
  if (!existsSync(logsDir)) return null;
  const files = readdirSync(logsDir)
    .map((name) => ({ name, n: Number(/^hlabsd\.(\d+)\.log$/.exec(name)?.[1] ?? NaN) }))
    .filter((f) => Number.isFinite(f.n))
    .sort((a, b) => b.n - a.n);
  return files[0] ? join(logsDir, files[0].name) : null;
}

export function lastLines(path: string | null, count = LOG_LINES): string[] {
  if (!path) return [];
  const lines = readFileSync(path, 'utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-count);
}

export function diagnosticsReport(deps: {
  config: DaemonConfig;
  engine: Pick<EngineService, 'status'>;
  readiness: Pick<Readiness, 'isReady'>;
  now?: Date;
}): string {
  const { config } = deps;
  const engine = deps.engine.status;
  const engineLine =
    engine.state === 'missing'
      ? 'none found'
      : `${engine.candidate.kind}${engine.candidate.managedByHlabs ? ' (installed by hlabs)' : ''}, ${engine.state}` +
        (engine.state === 'running' ? `, Docker ${engine.info.version}` : '');
  const lines = [
    'hlabs diagnostics',
    `Created: ${(deps.now ?? new Date()).toISOString()}`,
    `hlabs: ${config.version}`,
    `OS: ${process.platform} ${release()} (${arch()})${config.headless ? ', headless' : ''}`,
    `Container engine: ${engineLine}`,
    `Health: ${deps.readiness.isReady ? 'ready' : 'not ready'}`,
    '',
    `Last ${LOG_LINES} lines of the hlabs log:`,
    ...lastLines(newestLog(join(config.paths.dataDir, 'logs'))),
  ];
  return redactSecrets(lines.join('\n'));
}
