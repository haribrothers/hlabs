// The "Do this at home or on your tailnet" explanation (US-SYS-47): one at a time, opened by an "At home only" control
// or by HOME_ONLY from the daemon (any mutation, through the query client), and shown by <HomeOnlyHost />.
import { homeOnlyRule, type HomeOnlyProcedure } from '@hlabs/shared';
import { publicDashboardCopy as copy } from '../copy/public-dashboard';
import { errorData } from '../lib/error-copy';

let explaining: { what: string | null } | null = null;
const listeners = new Set<() => void>();
const publish = (next: typeof explaining) => {
  explaining = next;
  for (const l of listeners) l();
};

export const currentHomeOnly = () => explaining;
export const closeHomeOnly = () => publish(null);
export const subscribeHomeOnly = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** What a procedure does, as the explanation names it; null for one that isn't home-only. */
export function homeOnlyWhat(procedure: string | null | undefined): string | null {
  if (!procedure || homeOnlyRule(procedure) === null) return null;
  return copy.homeOnlyWhat[procedure as HomeOnlyProcedure];
}

/** Opens "Do this at home or on your tailnet", naming what (from the procedure) when known. */
export function explainHomeOnly(procedure?: HomeOnlyProcedure | string | null) {
  publish({ what: homeOnlyWhat(procedure) });
}

/** HOME_ONLY from the daemon (a call the UI didn't mark, or made some other way): the same explanation. */
export function explainIfHomeOnly(err: unknown): boolean {
  const data = errorData(err);
  if (data?.hlabsCode !== 'HOME_ONLY') return false;
  const procedure = data.detail?.procedure;
  explainHomeOnly(typeof procedure === 'string' ? procedure : null);
  return true;
}

// ── An app that opens at home only (HomePublicAddress) ──────────────────────────────────────────────────────────────

/** The app whose tile (or Dock tile, or search result) was chosen on the public address while it isn't public. */
export interface AwayApp {
  appId: string;
  name: string;
}

let away: AwayApp | null = null;
const awayListeners = new Set<() => void>();
const publishAway = (next: AwayApp | null) => {
  away = next;
  for (const l of awayListeners) l();
};

export const currentAway = () => away;
export const closeAway = () => publishAway(null);
export const subscribeAway = (l: () => void) => {
  awayListeners.add(l);
  return () => awayListeners.delete(l);
};

/** "<App> opens at home or on your tailnet." */
export function explainAway(app: AwayApp) {
  publishAway({ appId: app.appId, name: app.name });
}
