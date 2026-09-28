import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';

export const storage: AppHandlers<DaemonContext>['storage'] = {
  /** Only drives hlabs can write to are offered (US-ONB-15). */
  listDrives: async (_input, ctx) => ({
    drives: (await ctx.services.drives.externalDrives()).filter((d) => d.writable),
  }),
};
