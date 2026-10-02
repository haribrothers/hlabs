// The tray window: the menu for the tray's current state. Stats, actions and the other states arrive with their stories
// (US-INST-05…).
import { TrayMenu, TraySetup } from '@hlabs/ui';
import { useAccess, type Access } from './access';
import { useBoot, type BootState } from './boot';
import { useOpenSetup, useSetupPending } from './setup';
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

export function Menu() {
  const { access, retry } = useAccess();
  const boot = useBoot();
  const setupPending = useSetupPending(boot?.step === 'started' && access === 'ready');
  const openSetup = useOpenSetup();
  // Nothing until the Rust side has said where things stand, so no state flashes by.
  if (boot === null || access === null) return null;
  // The daemon didn't answer within 60 s: "Can't reach hlabs", and nothing is opened in the browser.
  if (boot.step === 'failed') return <AccessProblem access="unreachable" onRetry={() => void retry()} />;
  if (access !== 'ready') return <AccessProblem access={access} onRetry={() => void retry()} />;
  // Until onboarding is complete (also when hlabs restarts before it is, or the window was closed).
  const inSetup = setupPending === true || (boot.firstLaunch && setupPending === null);
  if (inSetup) return <FirstLaunch boot={boot} onOpenSetup={() => void openSetup()} />;
  return (
    <TrayMenu
      statusText={t.running}
      stats={[
        { label: t.cpu, value: '—' },
        { label: t.memory, value: '—' },
        { label: t.free, value: '—' },
      ]}
      items={[
        { label: t.openDashboard },
        { label: t.copyAddress },
        { label: t.backUpNow },
        { separator: true },
        { label: t.quit },
      ]}
    />
  );
}
