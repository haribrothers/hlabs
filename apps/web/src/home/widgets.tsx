// The widgets row (US-HOME-02): at most four, in the person's order, each on level-1 glass. A widget whose phase
// hasn't shipped is left out (D-036): Live usage until phase 4, Remote access 3, Backups 5.
import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import type { ComponentType } from 'react';
import { homeCopy } from '../copy/home';
import { LiveUsageWidget } from './live-usage-widget';
import { MyFilesWidget, SharedAppsWidget } from './member-widgets';
import { AppStatusWidget, AppWidget, BackupsWidget, RemoteAccessWidget, UpdatesWidget } from './more-widgets';
import { StorageWidget } from './storage-widget';

interface WidgetDef {
  /** The phase feature it needs; none = available now. */
  feature?: Feature;
  component?: ComponentType;
}

export const WIDGETS: Record<string, WidgetDef> = {
  'my-files': { component: MyFilesWidget },
  'shared-apps': { component: SharedAppsWidget },
  'live-usage': { component: LiveUsageWidget, feature: 'liveUsage' },
  storage: { component: StorageWidget },
  'remote-access': { component: RemoteAccessWidget, feature: 'remoteAccess' },
  backups: { component: BackupsWidget, feature: 'backups' },
  // Added from the picker (US-HOME-19).
  'app-status': { component: AppStatusWidget, feature: 'widgets' },
  updates: { component: UpdatesWidget, feature: 'widgets' },
};

/** An app's own widget: `app:<appId>:<widgetId>` (US-HOME-20). */
export const isAppWidget = (id: string) => id.startsWith('app:');

/** A widget by id, or null when it isn't drawn yet (its phase hasn't shipped, D-036). */
export function renderWidget(id: string, shippedPhase?: number) {
  if (isAppWidget(id)) return isFeatureEnabled('widgets', shippedPhase) ? <AppWidget key={id} id={id} /> : null;
  const def = WIDGETS[id];
  if (!def?.component || (def.feature && !isFeatureEnabled(def.feature, shippedPhase))) return null;
  const Widget = def.component;
  return <Widget key={id} />;
}

export const MAX_WIDGETS = 4;

/** The widgets to draw now, from the layout's widget ids. */
export function visibleWidgets(ids: readonly string[], shippedPhase?: number): string[] {
  return ids.filter((id) => renderWidget(id, shippedPhase) !== null).slice(0, MAX_WIDGETS);
}

/** Two to four widgets share the row's width (exported for edit mode, which draws the same row) on a wide screen (a member’s two are half each, US-HOME-12); a phone shows two side by side (PhoneHomeWidgets). */
export const LG_COLUMNS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

export function WidgetsRow({ ids, shippedPhase }: { ids: readonly string[]; shippedPhase?: number }) {
  const shown = visibleWidgets(ids, shippedPhase);
  if (shown.length === 0) return null;
  return (
    <section
      aria-label={homeCopy.widgets}
      className={`grid w-full grid-cols-2 gap-2.5 md:gap-4 ${LG_COLUMNS[shown.length] ?? 'lg:grid-cols-4'}`}
    >
      {shown.map((id) => renderWidget(id, shippedPhase))}
    </section>
  );
}
