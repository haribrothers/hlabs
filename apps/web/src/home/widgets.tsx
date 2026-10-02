// The widgets row (US-HOME-02): at most four, in the person's order, each on level-1 glass. A widget whose phase
// hasn't shipped is left out (D-036): Live usage until phase 4, Remote access 3, Backups 5.
import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import type { ComponentType } from 'react';
import { homeCopy } from '../copy/home';
import { MyFilesWidget, SharedAppsWidget } from './member-widgets';
import { StorageWidget } from './storage-widget';

interface WidgetDef {
  /** The phase feature it needs; none = available now. */
  feature?: Feature;
  component?: ComponentType;
}

export const WIDGETS: Record<string, WidgetDef> = {
  'my-files': { component: MyFilesWidget },
  'shared-apps': { component: SharedAppsWidget },
  'live-usage': { feature: 'liveUsage' },
  storage: { component: StorageWidget },
  'remote-access': { feature: 'remoteAccess' },
  backups: { feature: 'backups' },
};

export const MAX_WIDGETS = 4;

/** The widgets to draw now, from the layout's widget ids. */
export function visibleWidgets(ids: readonly string[], shippedPhase?: number): string[] {
  return ids
    .filter((id) => {
      const def = WIDGETS[id];
      return def?.component !== undefined && (!def.feature || isFeatureEnabled(def.feature, shippedPhase));
    })
    .slice(0, MAX_WIDGETS);
}

/** Two to four widgets share the row's width on a wide screen (a member's two are half each, US-HOME-12). */
const LG_COLUMNS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

export function WidgetsRow({ ids }: { ids: readonly string[] }) {
  const shown = visibleWidgets(ids);
  if (shown.length === 0) return null;
  return (
    <section
      aria-label={homeCopy.widgets}
      className={`grid w-full grid-cols-1 gap-4 sm:grid-cols-2 ${LG_COLUMNS[shown.length] ?? 'lg:grid-cols-4'}`}
    >
      {shown.map((id) => {
        const Widget = WIDGETS[id]!.component!;
        return <Widget key={id} />;
      })}
    </section>
  );
}
