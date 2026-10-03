import { hlabsError, type AppHandlers } from '@hlabs/api';
import { getSetting, setSetting } from '@hlabs/db';
import type { DaemonContext } from '../context';
import { lanAddresses } from '../mdns/publisher';
import { diagnosticsReport } from '../tray/diagnostics';
import { dashboardUrl, trayStatus } from '../tray/status';
import { trayUsers } from '../tray/users';

export const tray: AppHandlers<DaemonContext>['tray'] = {
  // US-INST-05: state, apps, CPU, memory, free space and the dashboard's address.
  status: (_input, ctx) => trayStatus(ctx.services),

  // US-INST-17: the accounts "Reset a password…" offers.
  listUsers: (_input, ctx) => ({ users: trayUsers(ctx.services.db) }),

  // US-INST-12: the same engine_start job as the dashboard's "Start engine" (US-STATE-09); a second press gets it again.
  startEngine: (_input, ctx) => {
    const { jobs } = ctx.services;
    const running = jobs.listActive().find((j) => j.kind === 'engine_start');
    if (running) return { jobId: running.id };
    return { jobId: jobs.start('engine_start', { payload: { userId: null, via: 'tray' } }) };
  },

  // US-INST-09: the tray changed start at login (or applied the saved choice); Settings shows the same (D-042). No
  // startup.changeRequested: the tray made the change.
  setStartAtLogin: ({ enabled }, ctx) => {
    const { db } = ctx.services;
    setSetting(db, 'startup', { ...getSetting(db, 'startup'), startAtLogin: enabled });
    return { ok: true as const };
  },

  // US-INST-12: a redacted plain-text report for "Copy diagnostics".
  diagnostics: (_input, ctx) => ({ report: diagnosticsReport(ctx.services) }),

  // US-INST-06: the dashboard's current address for "Open Dashboard" and "Copy dashboard address"; the tray opens or
  // copies it. Back up comes with backups (US-INST-07, phase 5).
  quickAction: ({ action }, ctx) => {
    if (action === 'openDashboard' || action === 'copyAddress') return { url: dashboardUrl(ctx.services) };
    // US-INST-08: one at a time; a second press gets the job already running.
    if (action === 'pauseAll' || action === 'resumeAll') {
      const kind = action === 'pauseAll' ? 'pause_all' : 'resume_all';
      const running = ctx.services.jobs.listActive().find((j) => j.kind === kind);
      return { jobId: running?.id ?? ctx.services.jobs.start(kind, { payload: { via: 'tray' } }) };
    }
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
