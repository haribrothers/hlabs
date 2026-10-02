import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { lanAddresses } from '../mdns/publisher';
import { dashboardUrl, trayStatus } from '../tray/status';

export const tray: AppHandlers<DaemonContext>['tray'] = {
  // US-INST-05: state, apps, CPU, memory, free space and the dashboard's address.
  status: (_input, ctx) => trayStatus(ctx.services),

  // US-INST-06: the dashboard's current address for "Open Dashboard" and "Copy dashboard address"; the tray opens or
  // copies it. Pause, resume and back up come with US-INST-08 and US-INST-07.
  quickAction: ({ action }, ctx) => {
    if (action === 'openDashboard' || action === 'copyAddress') return { url: dashboardUrl(ctx.services) };
    throw hlabsError('NOT_IMPLEMENTED', `tray.quickAction ${action} is not implemented yet`);
  },

  // US-INST-02: the tokenised setup URL the tray opens; null once onboarding is complete (D-013, D-035).
  setupUrl: async (_input, ctx) => {
    const { onboarding, config } = ctx.services;
    return {
      url: await onboarding.setupUrl(),
      lanUrls: config.proxy === 'caddy' ? await onboarding.lanSetupUrls(lanAddresses()) : [],
    };
  },
};
