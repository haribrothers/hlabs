// The "Installs" log (US-SYS-27, US-SYS-28): one line for each step of an app job (install, update, uninstall,
// reinstall, settings, moving data, starter apps) and how it ended, in `<dataDir>/logs/installs.log`, whatever the
// daemon's log level. Written as pino writes its lines, so the viewer reads both the same way. When it passes 5 MB
// it becomes installs.1.log (replacing the one before) and a new file starts.
import type { JobKind } from '@hlabs/api';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { EventBus } from '../events/bus';

export const INSTALLS_LOG = ['logs', 'installs.log'];
export const INSTALLS_LOG_MAX_BYTES = 5 * 1024 * 1024;

const VERBS: Partial<Record<JobKind, string>> = {
  app_install: 'Installing',
  app_update: 'Updating',
  app_uninstall: 'Uninstalling',
  app_reinstall: 'Reinstalling',
  app_config: 'Saving settings of',
  app_move_data: 'Moving the data of',
  app_deploy_custom: 'Deploying',
  starter_apps: 'Installing starter apps',
};

export class InstallsLog {
  private readonly path: string;
  /** The last message written for each running job, so a progress tick without a new step adds nothing. */
  private readonly last = new Map<string, string>();

  constructor(
    dataDir: string,
    private readonly maxBytes = INSTALLS_LOG_MAX_BYTES,
  ) {
    this.path = join(dataDir, ...INSTALLS_LOG);
  }

  /** Follows app jobs on the bus. Returns the unsubscribe function. */
  attach(bus: EventBus): () => void {
    return bus.on(({ event }) => {
      if (event.type === 'job.progress') {
        const { jobId, kind, target, progress, message } = event.data;
        const verb = VERBS[kind];
        if (!verb) return;
        const first = !this.last.has(jobId);
        const what = `${verb}${target ? ` ${target}` : ''}`;
        const text = message ? `${what}: ${message}` : first ? `${what} started` : null;
        if (!text || this.last.get(jobId) === text) return;
        this.last.set(jobId, text);
        this.append('info', text, { jobId, kind, ...(target ? { appId: target } : {}), progress });
      } else if (event.type === 'job.finished') {
        const { jobId, kind, target, state, hlabsCode } = event.data;
        const verb = VERBS[kind];
        if (!verb) return;
        this.last.delete(jobId);
        const what = `${verb}${target ? ` ${target}` : ''}`;
        this.append(state === 'failed' ? 'error' : 'info', `${what} ${state}`, {
          jobId,
          kind,
          ...(target ? { appId: target } : {}),
          ...(hlabsCode ? { code: hlabsCode } : {}),
        });
      }
    });
  }

  append(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}, at = Date.now()): void {
    const pinoLevel = { info: 30, warn: 40, error: 50 }[level];
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      if (existsSync(this.path) && statSync(this.path).size > this.maxBytes) {
        renameSync(this.path, join(dirname(this.path), 'installs.1.log'));
      }
      appendFileSync(this.path, `${JSON.stringify({ level: pinoLevel, time: at, msg, ...fields })}\n`, {
        mode: 0o600,
      });
    } catch {
      // A log that can't be written never stops an install.
    }
  }
}
