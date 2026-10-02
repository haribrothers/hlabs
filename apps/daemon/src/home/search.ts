// Search (US-HOME-09, US-HOME-10): one query over this person's apps, quick actions, App Store apps and settings
// pages, filtered here by role and app access, never only in the dashboard. Matching ignores case and accents and
// ranks matches at the start first. Files join with Files (phase 5).
import { getSetting, type HlabsDb } from '@hlabs/db';
import { SETTINGS_INDEX } from '@hlabs/api';
import { bestMatch, isFeatureEnabled, matchScore } from '@hlabs/shared';
import { listApps } from '../apps/list';
import type { StoreService } from '../store/service';
import { getLayout } from './layout';

/** With nothing typed, the installed apps search shows (US-HOME-09). */
const EMPTY_QUERY_APPS = 8;
/** The App Store group shows at most this many (US-HOME-10). */
const STORE_LIMIT = 3;

type Action = { kind: 'settings' | 'restart' | 'logs'; appId: string; appName: string };

export function searchEverything(
  deps: { db: HlabsDb; store: Pick<StoreService, 'listApps'>; isPublished: (name: string) => boolean },
  user: { id: string; role: 'admin' | 'member' },
  input: { query: string; limitPerGroup: number },
) {
  const { db } = deps;
  const admin = user.role === 'admin';
  const query = input.query.trim();
  const limit = input.limitPerGroup;
  const canInstall = admin || getSetting(db, 'people').membersCanInstall;

  // Installed apps in this person's Home order (only those they can open).
  const order = getLayout(db, user)
    .items.filter((i) => i.kind === 'app')
    .map((i) => i.id);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const apps = listApps(db, user, deps.isPublished).apps.sort((a, b) => rank(a.id) - rank(b.id));

  if (!query) {
    return {
      installed: apps.slice(0, EMPTY_QUERY_APPS),
      actions: [],
      store: canInstall ? [] : null,
      storeTotal: 0,
      files: null,
      settings: [],
    };
  }

  const byScore = <T>(items: Array<{ item: T; score: number }>) =>
    items.sort((a, b) => a.score - b.score).map((s) => s.item);

  const installed = byScore(
    apps.flatMap((app) => {
      const score = matchScore(app.name, query);
      return score === null ? [] : [{ item: app, score }];
    }),
  ).slice(0, limit);

  // Actions name their app, so "jelly" and "restart jelly" both find "Restart Jellyfin".
  const actions = admin
    ? byScore(
        apps.flatMap((app) => {
          const candidates: Array<[Action['kind'], string]> = [
            ['settings', `${app.name} settings`],
            ...(app.state === 'running' || app.state === 'error'
              ? ([['restart', `Restart ${app.name}`]] as Array<[Action['kind'], string]>)
              : []),
            ['logs', `View ${app.name} logs`],
          ];
          return candidates.flatMap(([kind, label]) => {
            const score = bestMatch([label, app.name], query);
            return score === null ? [] : [{ item: { kind, appId: app.id, appName: app.name }, score }];
          });
        }),
      ).slice(0, limit)
    : [];

  let store: ReturnType<StoreService['listApps']>['items'] | null = null;
  let storeTotal = 0;
  if (canInstall) {
    const matches = deps.store.listApps({ query }).items.filter((a) => !a.installed);
    storeTotal = matches.length;
    store = matches.slice(0, Math.min(STORE_LIMIT, limit));
  }

  const settings = byScore(
    SETTINGS_INDEX.filter((s) => (admin || !s.adminOnly) && (!s.feature || isFeatureEnabled(s.feature))).flatMap(
      (s) => {
        const score = bestMatch([s.title, ...s.keywords], query);
        return score === null ? [] : [{ item: { section: s.section, title: s.title }, score }];
      },
    ),
  ).slice(0, limit);

  return { installed, actions, store, storeTotal, files: null, settings };
}
