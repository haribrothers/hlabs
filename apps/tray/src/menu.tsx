// The tray window: the menu for the tray's current state. Stats, actions and the other states arrive with their stories
// (US-INST-05…).
import type { TrayStatus } from '@hlabs/api';
import { isFeatureEnabled } from '@hlabs/shared';
import { TrayMenu, TraySetup, type MenuItem } from '@hlabs/ui';
import { useAccess, type Access } from './access';
import { useBoot, type BootState } from './boot';
import { useDashboardActions } from './dashboard';
import { appsLine, formatCpu, formatFree, formatMemory } from './format';
import { useOpenSetup, useSetupPending } from './setup';
import { useMenuOpen, useTrayStatus } from './status';
import { trayCopy as t } from './copy';

export function AccessProblem({ access, onRetry }: { access: Exclude<Access, 'ready'>; onRetry: () => void }) {
  if (access === 'keychainDenied') {
    return (
      <TrayMenu
        tone="danger"
        statusText={t.keychainStatus}
        note={{ body: t.keychainNote }}
        action={{ label: t.tryAgain, onSelect: onRetry }}
        items={[{ label: t.quit, shortcut: '⌘Q' }]}
      />
    );
  }
  return (
    <TrayMenu
      tone="danger"
      statusText={t.unreachableStatus}
      action={{ label: t.tryAgain, onSelect: onRetry }}
      items={[{ label: t.quit, shortcut: '⌘Q' }]}
    />
  );
}

/**
 * TrayStates "First launch" (US-INST-01, US-INST-02): starting the background service, then opening setup in the
 * browser; "Open setup" stays available until onboarding is complete.
 */
export function FirstLaunch({ boot, onOpenSetup }: { boot: BootState; onOpenSetup: () => void }) {
  const started = boot.step === 'started';
  return (
    <TraySetup
      title={t.setupTitle}
      subtitle={t.setupSubtitle}
      stateLabels={t.stepStates}
      steps={[
        { label: t.stepService, state: started ? 'done' : 'working' },
        { label: t.stepBrowser, state: boot.setupOpened ? 'done' : started ? 'working' : 'pending' },
      ]}
      action={started ? { label: t.openSetup, onSelect: onOpenSetup } : undefined}
    />
  );
}

export interface RunningActions {
  openDashboard?: () => void;
  copyAddress?: () => void;
  /** "Copy dashboard address" reads "Copied" for 1.5 s. */
  copied?: boolean;
}

/**
 * The running menu, in the design's order (TrayMenu): what the actions do arrives with their stories (US-INST-05…10,
 * US-INST-17, US-INST-19); "Back up now" waits for backups (phase 5) and "Uninstall hlabs…" for phase 6 (D-036).
 */
export function runningItems(actions: RunningActions = {}): MenuItem[] {
  return [
    { separator: true },
    { label: t.openDashboard, shortcut: '⌘D', onSelect: actions.openDashboard },
    { label: actions.copied ? t.copied : t.copyAddress, onSelect: actions.copyAddress },
    ...(isFeatureEnabled('backups') ? [{ label: t.backUpNow }] : []),
    { separator: true },
    { label: t.startAtLogin, checked: true },
    { label: t.pauseAll },
    { label: t.checkForUpdates },
    { label: t.resetPassword },
    { separator: true },
    ...(isFeatureEnabled('uninstall') ? [{ label: t.uninstall }] : []),
    { label: t.quit, shortcut: '⌘Q' },
  ];
}

export function Menu() {
  const { access, retry } = useAccess();
  const boot = useBoot();
  const setupPending = useSetupPending(boot?.step === 'started' && access === 'ready');
  const openSetup = useOpenSetup();
  const open = useMenuOpen();
  const status = useTrayStatus(boot?.step === 'started' && access === 'ready', open);
  // Nothing until the Rust side has said where things stand, so no state flashes by.
  if (boot === null || access === null) return null;
  // The daemon didn't answer within 60 s: "Can't reach hlabs", and nothing is opened in the browser.
  if (boot.step === 'failed') return <AccessProblem access="unreachable" onRetry={() => void retry()} />;
  if (access !== 'ready') return <AccessProblem access={access} onRetry={() => void retry()} />;
  // Until onboarding is complete (also when hlabs restarts before it is, or the window was closed).
  const inSetup = setupPending === true || (boot.firstLaunch && setupPending === null);
  if (inSetup) return <FirstLaunch boot={boot} onOpenSetup={() => void openSetup()} />;
  // Waiting for /healthz after a launch: Starting, without counts yet (US-INST-11).
  if (boot.step === 'starting') return <StartingMenu status={null} />;
  return status?.state === 'starting' ? <StartingMenu status={status} /> : <RunningMenu status={status} />;
}

/** TrayStates "Starting" (US-INST-11): "Starting · 4 of 11 apps" with a bar, Open Dashboard, Show startup log, Quit. */
export function StartingMenu({ status }: { status: TrayStatus | null }) {
  const dashboard = useDashboardActions();
  const counted = status !== null && status.appsExpected > 0;
  const logPath = status?.startupLogAppId ? `/apps/${status.startupLogAppId}/logs` : '/';
  return (
    <TrayMenu
      status="working"
      statusText={counted ? t.startingApps(status.appsRunning, status.appsExpected) : t.starting}
      progress={
        counted
          ? {
              value: status.appsRunning / status.appsExpected,
              label: t.startingApps(status.appsRunning, status.appsExpected),
            }
          : undefined
      }
      items={[
        { separator: true },
        { label: t.openDashboard, shortcut: '⌘D', onSelect: () => void dashboard.open() },
        { label: t.showStartupLog, onSelect: () => void dashboard.open(logPath) },
        { separator: true },
        { label: t.quit, shortcut: '⌘Q' },
      ]}
    />
  );
}

/** The status line while running: "Running · 11 apps", or "Running · 10 of 11 apps · 1 needs attention". */
export function runningLine(status: TrayStatus): string {
  return status.appsNeedAttention > 0
    ? t.runningWithAttention(status.appsRunning, status.appsExpected, status.appsNeedAttention)
    : appsLine(status.appsRunning, t.runningApps);
}

/** TrayMenu (US-INST-05): "Running · N apps" and CPU, memory and free space; dashes until tray.status answers. */
export function RunningMenu({ status }: { status: TrayStatus | null }) {
  const dashboard = useDashboardActions();
  const cpu = formatCpu(status?.cpuPercent);
  const memory = formatMemory(status?.memoryUsedBytes);
  const free = formatFree(status?.freeBytes);
  const stopped = status?.state === 'engineStopped';
  const attention = (status?.appsNeedAttention ?? 0) > 0;
  return (
    <TrayMenu
      status={stopped || attention ? 'failed' : 'running'}
      statusText={stopped ? t.engineStopped : status ? runningLine(status) : t.running}
      stats={[
        { label: t.cpu, value: cpu, spoken: t.cpuSpoken(cpu) },
        { label: t.memory, value: memory, spoken: t.memorySpoken(memory) },
        { label: t.free, value: free, spoken: t.freeSpoken(free) },
      ]}
      items={runningItems({
        openDashboard: () => void dashboard.open(),
        copyAddress: () => void dashboard.copy(),
        copied: dashboard.copied,
      })}
    />
  );
}
