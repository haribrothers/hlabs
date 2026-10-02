// The tray window: the menu for the tray's current state. Stats, actions and the other states arrive with their stories
// (US-INST-05…).
import { TrayMenu } from '@hlabs/ui';
import { useAccess, type Access } from './access';
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

export function Menu() {
  const { access, retry } = useAccess();
  if (access !== null && access !== 'ready') return <AccessProblem access={access} onRetry={() => void retry()} />;
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
