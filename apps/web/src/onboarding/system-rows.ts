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
  /** A failed install: its last log line and what to do (US-ONB-06). */
  failure?: { line: string | null; hint: string };
  /** What to do before Retry, with a command to copy (US-ONB-07). */
  action?: { hint: string; command?: string };
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

/** hlabs's Colima install failed and there is still no running engine (US-ONB-06). */
export const installFailed = (check: SystemCheck | undefined) =>
  check !== undefined && check.engine.state !== 'running' && check.engine.install?.state === 'failed';

function installHint(code: string | null): string {
  const hints = copy.installHints;
  return code === 'ENGINE_DOWNLOAD_TIMEOUT' || code === 'ENGINE_START_FAILED' ? hints[code] : hints.other;
}

/** A Mac with no engine and no install yet: hlabs installs Colima without asking (US-ONB-05). */
export const shouldInstallEngine = (check: SystemCheck | undefined) =>
  check?.os.platform === 'darwin' && check.engine.state === 'missing' && check.engine.install === null;

function runtimeRow(engine: SystemCheck['engine'], platform: SystemCheck['os']['platform']): SystemRow {
  if (engine.state !== 'running' && engine.install?.state === 'failed') {
    return {
      id: 'runtime',
      title: copy.runtime,
      value: copy.installFailed,
      status: 'failed',
      failure: { line: engine.install.lastLogLine, hint: installHint(engine.install.hlabsCode) },
    };
  }
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
  const row = { id: 'runtime', title: copy.runtime, status: levelStatus[engine.level] } as const;
  switch (engine.state) {
    case 'running':
      return { ...row, value: [name, engine.version].filter(Boolean).join(' ') };
    case 'stopped':
      return { ...row, value: copy.runtimeStopped(name), action: { hint: copy.stoppedHint(name) } };
    case 'noAccess':
      return {
        ...row,
        value: copy.runtimeNoAccess,
        action: { hint: copy.noAccessHint, command: copy.dockerGroupCommand },
      };
    case 'missing':
      // On a Mac hlabs installs Colima itself (US-ONB-05); on Linux the person runs the install (US-ONB-07).
      return platform === 'linux'
        ? {
            ...row,
            value: copy.runtimeMissing,
            action: { hint: copy.linuxMissingHint, command: copy.linuxInstallCommand },
          }
        : { ...row, value: copy.runtimeMissing };
  }
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
    runtimeRow(check.engine, check.os.platform),
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
