import type { AppHandlers } from '@hlabs/api';
import { getSetting } from '@hlabs/db';
import type { DaemonContext } from '../context';

export const network: AppHandlers<DaemonContext>['network'] = {
  /** How hlabs is reached (US-SYS-01): its home-network addresses and web ports. */
  status: (_input, ctx) => {
    const { routing, db } = ctx.services;
    return { home: routing.homeNetwork(), ports: getSetting(db, 'network').ports };
  },
};
