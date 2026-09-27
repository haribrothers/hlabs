import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';

export const events: AppHandlers<DaemonContext>['events'] = {
  stream: (input, ctx, signal) =>
    ctx.services.bus.stream({
      listener: ctx.listener,
      lastEventId: input?.lastEventId,
      types: input?.types,
      signal,
    }),
};
