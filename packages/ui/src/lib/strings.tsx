// Words the components render themselves. Apps pass their copy (apps/web/src/copy) through
// <UiStringsProvider>; these English defaults are for previews and tests.
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface UiStrings {
  dock: string;
  tabBar: string;
  search: string;
  addToDock: string;
  /** Screen-reader suffix for a count badge, e.g. ", 2 updates". */
  badgeUpdates: (n: number) => string;
  badgeNew: (n: number) => string;
  open: string;
  installing: (percent: number) => string;
  updating: string;
  appState: { update: string; error: string; stopped: string };
  dismiss: string;
  step: (current: number, total: number) => string;
  /** CodeInput field names: "Digit 1"… */
  digit: (n: number) => string;
  setupProgress: string;
  chartHint: string;
  chartData: string;
  /** The first column of a chart's hidden table. */
  chartTime: string;
  value: string;
  free: string;
  failed: string;
  succeeded: string;
  trend: (latest: string) => string;
  of: (used: string, total: string) => string;
  shared: string;
  done: string;
}

export const defaultStrings: UiStrings = {
  dock: 'Dock',
  tabBar: 'Tab bar',
  search: 'Search',
  addToDock: 'Add to Dock',
  badgeUpdates: (n) => `${n} ${n === 1 ? 'update' : 'updates'}`,
  badgeNew: (n) => `${n} new`,
  open: 'open',
  installing: (p) => `Installing… ${p}%`,
  updating: 'Updating…',
  appState: { update: 'Update', error: 'Error', stopped: 'Stopped' },
  dismiss: 'Dismiss',
  step: (c, t) => `Step ${c} of ${t}`,
  digit: (n) => `Digit ${n}`,
  setupProgress: 'Setup progress',
  chartHint: 'Use left and right arrow keys to read values.',
  chartData: 'Chart data',
  chartTime: 'Time',
  value: 'Value',
  free: 'Free',
  failed: 'Failed',
  succeeded: 'Succeeded',
  trend: (latest) => `Trend, latest ${latest}`,
  of: (used, total) => `${used} of ${total}`,
  shared: 'Shared',
  done: 'done',
};

const Context = createContext<UiStrings>(defaultStrings);

export function UiStringsProvider({ strings, children }: { strings: Partial<UiStrings>; children: ReactNode }) {
  const value = useMemo(() => ({ ...defaultStrings, ...strings }), [strings]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useUiStrings = (): UiStrings => useContext(Context);
