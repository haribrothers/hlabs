// `hlabs status` (US-INST-25): what the menu-bar app's status line and stats say (US-INST-05), for a server without a
// desktop. Exits 0 when running, 1 when something needs looking at, 2 when hlabs can't be reached.
import type { TrayStatus } from '@hlabs/api';
import { CliError, UNREACHABLE, type DaemonClient } from './daemon';
import type { Io } from './io';

export const RUNNING = 0;
export const DEGRADED = 1;

const GIB = 1024 ** 3;
const GB = 1000 ** 3;
const NO_VALUE = '–';

const cpu = (p: number | null) => (p === null ? NO_VALUE : `${Math.round(p)}%`);
const memory = (b: number | null) => (b === null ? NO_VALUE : `${(b / GIB).toFixed(1)} GB`);
const free = (b: number | null) => {
  if (b === null) return NO_VALUE;
  const gb = b / GB;
  return gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${Math.round(gb)} GB`;
};
const apps = (n: number) => (n === 0 ? 'no apps' : n === 1 ? '1 app' : `${n} apps`);

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago". */
export function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function stateLine(s: TrayStatus): string {
  if (s.state === 'engineStopped') return 'Container engine stopped';
  if (s.state === 'paused') return 'Paused · apps stopped';
  if (s.state === 'starting') return `Starting · ${s.appsRunning} of ${s.appsExpected} apps`;
  if (s.appsNeedAttention > 0) {
    const n = s.appsNeedAttention;
    return `Running · ${s.appsRunning} of ${s.appsExpected} apps · ${n} ${n === 1 ? 'needs' : 'need'} attention`;
  }
  return `Running · ${apps(s.appsRunning)}`;
}

function backupLine(b: TrayStatus['backup'], now: number): string {
  if (!b.configured) return 'Backups: not set up';
  if (b.running) return `Backing up… ${Math.round((b.progress ?? 0) * 100)}%`;
  if (b.lastFailed) return 'Last backup failed';
  return `Last backup: ${b.lastSucceededAt === null ? 'never' : ago(b.lastSucceededAt, now)}`;
}

export async function status(io: Io, client: DaemonClient, now: number): Promise<number> {
  let s: TrayStatus;
  try {
    s = await client.query<TrayStatus>('tray.status');
  } catch (err) {
    if (err instanceof CliError && err.code === UNREACHABLE) {
      io.out("hlabs · Can't reach hlabs");
      io.err(err.message);
      return UNREACHABLE;
    }
    throw err;
  }
  io.out(`hlabs · ${stateLine(s)}`);
  if (s.state === 'engineStopped') {
    io.out(
      `${s.engine.name ? `${engineName(s.engine.name)} isn't running` : "The container engine isn't running"}, so your apps are offline.`,
    );
  }
  io.out(`CPU ${cpu(s.cpuPercent)} · Memory ${memory(s.memoryUsedBytes)} · Free ${free(s.freeBytes)}`);
  io.out(backupLine(s.backup, now));
  if (s.portProblem) {
    const by = s.portProblem.heldBy === 'tailscaleServe' ? 'Tailscale Serve' : 'another program';
    io.out(`! Port ${s.portProblem.port} is used by ${by}, so other devices can't reach hlabs`);
  }
  io.out(s.onboardingComplete ? `Dashboard: ${s.dashboardUrl}` : "Setup isn't finished: run hlabs setup-url");
  const degraded = s.state !== 'running' || s.appsNeedAttention > 0 || s.portProblem !== null || !s.engine.running;
  return degraded ? DEGRADED : RUNNING;
}

const ENGINES: Record<string, string> = {
  orbstack: 'OrbStack',
  'docker-desktop': 'Docker Desktop',
  colima: 'Colima',
  'docker-engine': 'Docker Engine',
};
const engineName = (kind: string) => ENGINES[kind] ?? kind;
