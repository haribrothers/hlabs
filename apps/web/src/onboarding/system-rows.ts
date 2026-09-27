// The rows of the system check (US-ONB-04), worded from onboarding.checkSystem.
import type { AppRouter } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import type { Status } from '@hlabs/ui';
import type { inferRouterOutputs } from '@trpc/server';
import { onboardingCopy } from '../copy/onboarding';

export type SystemCheck = inferRouterOutputs<AppRouter>['onboarding']['checkSystem'];

export interface SystemRow {
  id: 'cpu' | 'os' | 'runtime' | 'disk' | 'ports';
  title: string;
  /** The value next to the status dot. */
  value: string;
  status: Status;
  /** What to do about a warning or error. */
  hint?: string;
  /** A job in progress on this row (0–100), shown as a Progress bar with `note` under it. */
  progress?: number;
  note?: string;
}

const copy = onboardingCopy.system;
const levelStatus = { ok: 'running', warning: 'working', error: 'failed' } as const satisfies Record<string, Status>;

/** "Apple Silicon (arm64)" on a Mac with Apple silicon; otherwise the CPU model without the marketing marks. */
export function cpuLabel(cpu: SystemCheck['cpu'], platform: SystemCheck['os']['platform']): string {
  if (platform === 'darwin' && cpu.arch === 'arm64') return `${copy.appleSilicon} (${cpu.arch})`;
  const model = cpu.model
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s+CPU\s+@.*$/i, '')
    .replace(/\s+\d+-Core Processor$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${model} (${cpu.arch})`;
}

/** hlabs's Colima install is queued or running (US-ONB-05). */
export const isInstalling = (check: SystemCheck | undefined) =>
  check?.engine.install?.state === 'queued' || check?.engine.install?.state === 'running';

/** A Mac with no engine and no install yet: hlabs installs Colima without asking (US-ONB-05). */
export const shouldInstallEngine = (check: SystemCheck | undefined) =>
  check?.os.platform === 'darwin' && check.engine.state === 'missing' && check.engine.install === null;

function runtimeRow(engine: SystemCheck['engine']): SystemRow {
  if (engine.state !== 'running' && (engine.install?.state === 'queued' || engine.install?.state === 'running')) {
    const percent = engine.install.progress;
    return {
      id: 'runtime',
      title: copy.runtime,
      value: copy.installing(percent),
      status: 'working',
      progress: percent,
      note: copy.installNote,
    };
  }
  const name = engine.kind ? copy.engines[engine.kind] : '';
  const value =
    engine.state === 'running'
      ? [name, engine.version].filter(Boolean).join(' ')
      : engine.state === 'stopped'
        ? copy.runtimeStopped(name)
        : copy.runtimeMissing;
  return { id: 'runtime', title: copy.runtime, value, status: levelStatus[engine.level] };
}

function portsRow(ports: SystemCheck['ports']): SystemRow {
  const taken = [ports.http, ports.https].filter((p) => p.inUse);
  if (taken.length === 0) return { id: 'ports', title: copy.ports, value: copy.available, status: 'running' };
  const title = taken.length === 1 ? copy.port(taken[0]!.port) : copy.ports;
  const fallbacks = taken.map((p) => String(p.use));
  const value = copy.inUse(fallbacks.length === 1 ? fallbacks[0]! : copy.and(fallbacks[0]!, fallbacks[1]!));
  return { id: 'ports', title, value, status: 'working' };
}

/** Five rows; while the check runs each shows "Checking…" with a working dot. */
export function systemRows(check: SystemCheck | undefined): SystemRow[] {
  if (!check) {
    const checking = { value: copy.checking, status: 'working' } as const;
    return [
      { id: 'cpu', title: copy.processor, ...checking },
      { id: 'os', title: copy.os, ...checking },
      { id: 'runtime', title: copy.runtime, ...checking },
      { id: 'disk', title: copy.disk, ...checking },
      { id: 'ports', title: copy.ports, ...checking },
    ];
  }
  const diskHint = { ok: undefined, warning: copy.diskWarning, error: copy.diskError }[check.disk.level];
  return [
    { id: 'cpu', title: copy.processor, value: cpuLabel(check.cpu, check.os.platform), status: 'running' },
    { id: 'os', title: copy.os, value: `${check.os.name} ${check.os.version}`.trim(), status: 'running' },
    runtimeRow(check.engine),
    {
      id: 'disk',
      title: copy.disk,
      value: formatBytes(check.disk.freeBytes),
      status: levelStatus[check.disk.level],
      ...(diskHint ? { hint: diskHint } : {}),
    },
    portsRow(check.ports),
  ];
}
