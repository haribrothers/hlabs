import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';

export const jobs: AppHandlers<DaemonContext>['jobs'] = {
  get: ({ jobId }, ctx) => {
    const job = ctx.services.jobs.get(jobId);
    if (!job) throw hlabsError('NOT_FOUND');
    return job;
  },
  list: (_input, ctx) => ({ items: ctx.services.jobs.listActive() }),
  cancel: ({ jobId }, ctx) => {
    ctx.services.jobs.cancel(jobId);
    return { ok: true };
  },
};
