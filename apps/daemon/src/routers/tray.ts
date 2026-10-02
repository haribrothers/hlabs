import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { lanAddresses } from '../mdns/publisher';

export const tray: AppHandlers<DaemonContext>['tray'] = {
  // US-INST-02: the tokenised setup URL the tray opens; null once onboarding is complete (D-013, D-035).
  setupUrl: async (_input, ctx) => {
    const { onboarding, config } = ctx.services;
    return {
      url: await onboarding.setupUrl(),
      lanUrls: config.proxy === 'caddy' ? await onboarding.lanSetupUrls(lanAddresses()) : [],
    };
  },
};
