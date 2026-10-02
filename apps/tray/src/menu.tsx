// The tray window: the menu for the tray's current state. Stats, actions and the other states arrive with their stories
// (US-INST-05…).
import { TrayMenu, TraySetup } from '@hlabs/ui';
import { useAccess, type Access } from './access';
import { useBoot } from './boot';
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

/** TrayStates "First launch" (US-INST-01). Opening setup in the browser is US-INST-02. */
export function FirstLaunch({ started }: { started: boolean }) {
  return (
    <TraySetup
      title={t.setupTitle}
      subtitle={t.setupSubtitle}
      stateLabels={t.stepStates}
      steps={[
        { label: t.stepService, state: started ? 'done' : 'working' },
        { label: t.stepBrowser, state: 'pending' },
      ]}
    />
  );
}

export function Menu() {
  const { access, retry } = useAccess();
  const boot = useBoot();
  // The daemon didn't answer within 60 s: "Can't reach hlabs", and nothing is opened in the browser.
  if (boot?.step === 'failed') return <AccessProblem access="unreachable" onRetry={() => void retry()} />;
  if (access !== null && access !== 'ready') return <AccessProblem access={access} onRetry={() => void retry()} />;
  if (boot?.firstLaunch) return <FirstLaunch started={boot.step === 'started'} />;
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
