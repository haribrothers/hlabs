// What a toast's buttons do (US-STATE-15). Notifications carry `action_json` (05 Canonical names); navigate actions
// get their label and gates from where they go, mutations run only from the allow-list, and members never see an
// action that needs an admin.
import type { AppRouter, NotificationAction } from '@hlabs/api';
import { isFeatureEnabled, SHIPPED_PHASE, TOAST_MUTATIONS, type ToastMutation } from '@hlabs/shared';
import type { TRPCClient } from '@trpc/client';
import { toastCopy } from '../copy/toasts';
import type { ToastAction } from './toasts';

const copy = toastCopy;

/** Known destinations: the button's label, and who may use it when. */
const DESTINATIONS: ReadonlyArray<{
  path: RegExp;
  action: Omit<Extract<ToastAction, { kind: 'navigate' }>, 'kind' | 'to'>;
}> = [
  // AppLogs (phase 2).
  { path: /^\/apps\/[^/]+\/logs$/, action: { label: copy.viewLogs, admin: true, feature: 'apps' } },
  // SettingsStorage (phase 7).
  { path: /^\/settings\/storage$/, action: { label: copy.manageStorage, admin: true, feature: 'storageSettings' } },
];

/** A notification's buttons as toast actions; anything not on the allow-list is dropped. */
export function actionsFromNotification(actions: readonly NotificationAction[] | null): ToastAction[] {
  return (actions ?? []).flatMap((a): ToastAction[] => {
    if (a.kind === 'mutation') {
      if (!(TOAST_MUTATIONS as readonly string[]).includes(a.procedure)) return [];
      return [{ kind: 'mutation', label: a.label, procedure: a.procedure, input: a.input }];
    }
    const known = DESTINATIONS.find((d) => d.path.test(a.to));
    return [{ kind: 'navigate', to: a.to, ...(known?.action ?? { label: copy.open }) }];
  });
}

/** Every allow-listed mutation is admin-only. */
export const needsAdmin = (a: ToastAction) => a.kind === 'mutation' || Boolean(a.admin);

/** The buttons to show: at most two, none a member can't use, none from a phase that hasn't shipped. */
export function visibleActions(
  actions: readonly ToastAction[] | undefined,
  { isAdmin, shippedPhase = SHIPPED_PHASE }: { isAdmin: boolean; shippedPhase?: number },
): ToastAction[] {
  return (actions ?? [])
    .filter((a) => isAdmin || !needsAdmin(a))
    .filter((a) => a.kind !== 'navigate' || !a.feature || isFeatureEnabled(a.feature, shippedPhase))
    .slice(0, 2);
}

/** Runs an allow-listed mutation. */
export function runToastMutation(
  client: TRPCClient<AppRouter>,
  procedure: ToastMutation,
  input: Record<string, unknown>,
) {
  switch (procedure) {
    case 'apps.start':
      return client.apps.start.mutate(input as Parameters<typeof client.apps.start.mutate>[0]);
    case 'apps.restart':
      return client.apps.restart.mutate(input as Parameters<typeof client.apps.restart.mutate>[0]);
    case 'backups.runNow':
      return client.backups.runNow.mutate(input as Parameters<typeof client.backups.runNow.mutate>[0]);
    case 'settings.updates.check':
      return client.settings.updates.check.mutate();
  }
}
