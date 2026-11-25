// What a toast's buttons do (US-STATE-15). Notifications carry `action_json` (05 Canonical names); navigate actions
// get their label and gates from where they go, mutations run only from the allow-list, and members never see an
// action that needs an admin.
import type { AppRouter, NotificationAction } from '@hlabs/api';
import { isFeatureEnabled, VISIBLE_PHASE, TOAST_MUTATIONS, type ToastMutation } from '@hlabs/shared';
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
  // SettingsUpdates (phase 4): an update that didn't install (US-STATE-03), automatic updates (US-SYS-26).
  { path: /^\/settings\/updates$/, action: { label: copy.viewDetails, admin: true, feature: 'hlabsUpdates' } },
  // SettingsNetwork (phase 3): another program holds hlabs's web port (US-SYS-42).
  { path: /^\/settings\/network$/, action: { label: copy.changePort, admin: true, feature: 'remoteAccess' } },
  // The App Store's updates (phase 7, US-STORE-15): "2 app updates available".
  { path: /^\/store\/updates$/, action: { label: copy.review, admin: true, feature: 'appUpdates' } },
  // Settings › Account, where sessions are: repeated failed logins, a used recovery code (US-HOME-14).
  { path: /^\/settings\/account$/, action: { label: copy.seeSessions, item: true } },
  // A public app's Visits (US-APP-29): the attack warning's "See visits".
  {
    path: /^\/apps\/[^/]+\/settings\?view=visits$/,
    action: { label: copy.seeVisits, admin: true, feature: 'publicApps' },
  },
  // A public app's settings (US-APP-27): "<Name> made <App> public…".
  { path: /^\/apps\/[^/]+\/settings$/, action: { label: copy.appSettings, admin: true } },
  // SettingsStorage (phase 7).
  { path: /^\/settings\/storage$/, action: { label: copy.manageStorage, admin: true, feature: 'storageSettings' } },
];

/** A navigate action's `params` as the address's search (`/apps/immich/settings?view=visits`): strings only. */
function withParams(to: string, params: Record<string, unknown> | undefined): string {
  const entries = Object.entries(params ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string');
  if (!entries.length) return to;
  return `${to}${to.includes('?') ? '&' : '?'}${new URLSearchParams(entries).toString()}`;
}

/** A notification's buttons as toast actions; anything not on the allow-list is dropped. */
export function actionsFromNotification(actions: readonly NotificationAction[] | null): ToastAction[] {
  return (actions ?? []).flatMap((a): ToastAction[] => {
    if (a.kind === 'mutation') {
      if (!(TOAST_MUTATIONS as readonly string[]).includes(a.procedure)) return [];
      return [{ kind: 'mutation', label: a.label, procedure: a.procedure, input: a.input }];
    }
    const to = withParams(a.to, a.params);
    const known = DESTINATIONS.find((d) => d.path.test(to));
    return [{ kind: 'navigate', to, ...(known?.action ?? { label: copy.open }) }];
  });
}

/** Every allow-listed mutation is admin-only. */
export const needsAdmin = (a: ToastAction) => a.kind === 'mutation' || (a.kind === 'navigate' && Boolean(a.admin));

/** The buttons to show: at most two, none a member can't use, none from a phase that hasn't shipped. */
export function visibleActions(
  actions: readonly ToastAction[] | undefined,
  { isAdmin, shippedPhase = VISIBLE_PHASE }: { isAdmin: boolean; shippedPhase?: number },
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
    case 'apps.uninstall':
      return client.apps.uninstall.mutate(input as Parameters<typeof client.apps.uninstall.mutate>[0]);
    case 'apps.reinstall':
      return client.apps.reinstall.mutate(input as Parameters<typeof client.apps.reinstall.mutate>[0]);
    case 'backups.runNow':
      return client.backups.runNow.mutate(input as Parameters<typeof client.backups.runNow.mutate>[0]);
    case 'settings.updates.check':
      return client.settings.updates.check.mutate();
    case 'apps.setPublic':
      // From a toast only ever "Make private" (US-APP-29): never makes anything public.
      return client.apps.setPublic.mutate({ appId: String(input.appId), public: false });
  }
}
