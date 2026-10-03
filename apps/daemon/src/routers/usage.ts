import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';

export const usage: AppHandlers<DaemonContext>['usage'] = {
  // US-USE-08: the latest sample (members' access is checked in DaemonContext.authorize, D-029).
  current: (_input, ctx) => ctx.services.usage.latest(),
  // US-USE-09: points at the right resolution and the metric's peak.
  history: ({ scope, range, metric }, ctx) => ctx.services.usageHistory.history(scope, range, metric),
};
