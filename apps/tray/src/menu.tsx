// The tray window: the menu for the tray's current state. Stats, actions and the other states arrive with their stories
// (US-INST-05…).
import type { TrayStatus } from '@hlabs/api';
import { isFeatureEnabled } from '@hlabs/shared';
import { TrayMenu, TraySetup, type MenuItem } from '@hlabs/ui';
import { useAccess, type Access } from './access';
import { useBoot, type BootState } from './boot';
import { useDashboardActions } from './dashboard';
import { useCopyDiagnostics, useStartEngine } from './engine';
import { useDaemonDownActions, useHealth, type DaemonHealth } from './health';
import { iconFor, useMenuBarIcon } from './icon';
import { appsLine, formatCpu, formatFree, formatMemory } from './format';
import { useOpenSetup, useSetupPending } from './setup';
import { quitTray } from './quit';
import { useQuickAction } from './quick-action';
import { useStartAtLogin } from './start-at-login';
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
        items={[quitItem]}
      />
    );
  }
  return (
    <TrayMenu
      tone="danger"
      statusText={t.unreachableStatus}
      action={{ label: t.tryAgain, onSelect: onRetry }}
      items={[quitItem]}
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
  pauseAll?: () => void;
  /** "Start at login": what the OS does now, and its toggle (US-INST-09). */
  startAtLogin?: { checked: boolean; failed: boolean; toggle: () => void };
}

/** "Quit hlabs" (⌘Q, US-INST-10): quits only the menu-bar app; hlabs and your apps keep running (D-015). */
export const quitItem: MenuItem = { label: t.quit, shortcut: '⌘Q', onSelect: () => void quitTray() };

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
    {
      label: actions.startAtLogin?.failed ? t.startAtLoginFailed : t.startAtLogin,
      checked: actions.startAtLogin?.checked ?? true,
      onSelect: actions.startAtLogin?.toggle,
    },
    { label: t.pauseAll, onSelect: actions.pauseAll },
    { label: t.checkForUpdates },
    { label: t.resetPassword },
    { separator: true },
    ...(isFeatureEnabled('uninstall') ? [{ label: t.uninstall }] : []),
    quitItem,
  ];
}

export function Menu() {
  const { access, retry } = useAccess();
  const boot = useBoot();
  const setupPending = useSetupPending(boot?.step === 'started' && access === 'ready');
  const openSetup = useOpenSetup();
  const open = useMenuOpen();
  const health = useHealth();
  const [status, refresh] = useTrayStatus(boot?.step === 'started' && access === 'ready', open);
  useMenuBarIcon(iconFor({ boot, access, health, status }));
  // Applied even while the menu is closed, so a change in Settings reaches the OS (US-INST-09).
  const startAtLogin = useStartAtLogin(status?.startAtLogin, refresh);
  // Nothing until the Rust side has said where things stand, so no state flashes by.
  if (boot === null || access === null) return null;
  // hlabs isn't answering (or didn't start within 60 s): "Can't reach hlabs"; nothing is opened in the browser.
  if (health?.state === 'down' || health?.state === 'restarting' || health?.state === 'updating')
    return <DaemonDownMenu health={health} />;
  if (boot.step === 'failed') return <DaemonDownMenu health={{ state: 'down', reason: boot.reason }} />;
  if (access !== 'ready') return <AccessProblem access={access} onRetry={() => void retry()} />;
  // Until onboarding is complete (also when hlabs restarts before it is, or the window was closed).
  const inSetup = setupPending === true || (boot.firstLaunch && setupPending === null);
  if (inSetup) return <FirstLaunch boot={boot} onOpenSetup={() => void openSetup()} />;
  // Waiting for /healthz after a launch, or it says hlabs is starting: Starting, without counts yet (US-INST-11).
  if (boot.step === 'starting' || health?.state === 'starting') return <StartingMenu status={null} />;
  if (status?.state === 'engineStopped') return <EngineStoppedMenu status={status} />;
  if (status?.state === 'paused') return <PausedMenu onChanged={refresh} />;
  return status?.state === 'starting' ? (
    <StartingMenu status={status} />
  ) : (
    <RunningMenu status={status} onChanged={refresh} startAtLogin={startAtLogin} />
  );
}

/** TrayStates "Paused" (US-INST-08): only Resume apps, Open Dashboard and Quit. */
export function PausedMenu({ onChanged }: { onChanged?: () => void }) {
  const dashboard = useDashboardActions();
  const resume = useQuickAction('resumeAll', onChanged);
  return (
    <TrayMenu
      status="stopped"
      statusText={t.paused}
      note={{ body: t.pausedNote }}
      action={{ label: t.resumeApps, onSelect: () => void resume.run(), busy: resume.busy }}
      items={[
        { separator: true },
        { label: t.openDashboard, shortcut: '⌘D', onSelect: () => void dashboard.open() },
        { separator: true },
        quitItem,
      ]}
    />
  );
}

/**
 * "Can't reach hlabs" (US-INST-13, US-STATE-07): Restart hlabs, Show logs, Copy diagnostics, Quit, none of which need
 * the API; "Restarting…" while it restarts; "Updating hlabs…" (no restart) during an update.
 */
export function DaemonDownMenu({
  health,
}: {
  health: Extract<DaemonHealth, { state: 'down' | 'restarting' | 'updating' }>;
}) {
  const actions = useDaemonDownActions();
  const dashboard = useDashboardActions();
  const quit = quitItem;
  if (health.state === 'updating') {
    return (
      <TrayMenu
        status="working"
        statusText={t.updating}
        items={[
          { separator: true },
          { label: t.openDashboard, shortcut: '⌘D', onSelect: () => void dashboard.open() },
          { separator: true },
          quit,
        ]}
      />
    );
  }
  const reason = health.state === 'down' && health.reason ? (t.downReasons[health.reason] ?? null) : null;
  const restarting = health.state === 'restarting';
  return (
    <TrayMenu
      tone="danger"
      statusText={restarting ? t.restarting : t.unreachableStatus}
      note={{ body: reason ?? t.downNote }}
      items={[
        { separator: true },
        // With a reason, the dashboard's address shows the "Can't reach hlabs" page that explains it.
        ...(reason ? [{ label: t.openDashboard, shortcut: '⌘D', onSelect: () => void dashboard.open() }] : []),
        { label: t.restartHlabs, onSelect: () => void actions.restart(), disabled: restarting },
        { label: t.showLogs, onSelect: () => void actions.showLogs() },
        { label: actions.copied ? t.copied : t.copyDiagnostics, onSelect: () => void actions.copyDiagnostics() },
        { separator: true },
        quit,
      ]}
    />
  );
}

/** TrayStates "Error" (US-INST-12): the engine stopped, with Start engine, Troubleshoot… and Copy diagnostics. */
export function EngineStoppedMenu({ status }: { status: TrayStatus }) {
  const dashboard = useDashboardActions();
  const engine = useStartEngine(status.engine.running);
  const diagnostics = useCopyDiagnostics();
  const name = status.engine.name ? (t.engineNames[status.engine.name] ?? null) : null;
  return (
    <TrayMenu
      tone="danger"
      statusText={t.engineStopped}
      note={{
        title: engine.phase === 'failed' ? t.engineDidntStart : undefined,
        body: t.engineOffline(name),
      }}
      action={
        status.engine.canStart
          ? {
              label: engine.phase === 'starting' ? t.startingEngine : t.startEngine,
              onSelect: () => void engine.start(),
              busy: engine.phase === 'starting',
            }
          : undefined
      }
      items={[
        { separator: true },
        { label: t.troubleshoot, onSelect: () => void dashboard.open('/') },
        { label: diagnostics.copied ? t.copied : t.copyDiagnostics, onSelect: () => void diagnostics.copy() },
        { separator: true },
        quitItem,
      ]}
    />
  );
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
        quitItem,
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
export function RunningMenu({
  status,
  onChanged,
  startAtLogin,
}: {
  status: TrayStatus | null;
  onChanged?: () => void;
  startAtLogin?: RunningActions['startAtLogin'];
}) {
  const dashboard = useDashboardActions();
  const pause = useQuickAction('pauseAll', onChanged);
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
        pauseAll: pause.busy ? undefined : () => void pause.run(),
        startAtLogin,
      })}
    />
  );
}
