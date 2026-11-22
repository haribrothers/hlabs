import { hlabsError, type AppHandlers } from '@hlabs/api';
import { getSetting, setSetting } from '@hlabs/db';
import type { DaemonContext } from '../context';
import { useOtherPort } from '../network/port-problem';
import { diagnosticsReport } from '../tray/diagnostics';
import { dashboardUrl, trayStatus } from '../tray/status';
import { trayResetPassword } from '../tray/reset-password';
import { setupUrls } from '../tray/setup-url';
import { trayAppLogs } from '../tray/app-logs';
import { trayUsers } from '../tray/users';
import { libraryKeygen, librarySign } from '../store/library-keys';

export const tray: AppHandlers<DaemonContext>['tray'] = {
  // US-INST-05: state, apps, CPU, memory, free space and the dashboard's address.
  status: (_input, ctx) => trayStatus(ctx.services),

  // US-INST-18: the reset itself, after the tray had the Mac's login confirm it.
  resetPassword: async (input, ctx) => {
    await trayResetPassword(ctx.services, input);
    return { ok: true as const };
  },

  // US-INST-21: what the uninstall window says.
  uninstallInfo: (_input, ctx) => ctx.services.uninstall.info(),

  // US-INST-22 (D-143, D-144): the daemon's part of uninstalling; the tray or install.sh does the rest after it.
  libraryKeygen: ({ replace }, ctx) => libraryKeygen(ctx.services.secrets, replace ?? false),
  librarySign: ({ data }, ctx) => librarySign(ctx.services.secrets, data),
  uninstall: ({ keepData, removeColima, via }, ctx) => ({
    jobId: ctx.services.uninstall.start({ keepData, removeColima, via: via ?? 'tray' }),
  }),

  // Following the uninstall job (the tray token may call tray.* only, D-035).
  job: ({ jobId }, ctx) => {
    const job = ctx.services.jobs.get(jobId);
    if (!job || job.kind !== 'hlabs_uninstall') throw hlabsError('NOT_FOUND');
    return job;
  },

  // US-INST-25: one app's container logs for `hlabs logs --app` (the tray token calls tray.* only, D-035).
  appLogs: (input, ctx) => trayAppLogs(ctx.services, input),

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
  // copies it.
  quickAction: ({ action }, ctx) => {
    if (action === 'openDashboard' || action === 'copyAddress') return { url: dashboardUrl(ctx.services) };
    // US-INST-08: one at a time; a second press gets the job already running.
    if (action === 'pauseAll' || action === 'resumeAll') {
      const kind = action === 'pauseAll' ? 'pause_all' : 'resume_all';
      const running = ctx.services.jobs.listActive().find((j) => j.kind === kind);
      return { jobId: running?.id ?? ctx.services.jobs.start(kind, { payload: { via: 'tray' } }) };
    }
    // US-BKP-04: the same as "Back up now" in Backups.
    if (action === 'backupNow') return ctx.services.backups.runNow();
    throw hlabsError('NOT_IMPLEMENTED', `tray.quickAction ${action} is not implemented yet`);
  },

  // US-INST-10 (D-120): "Quit hlabs" stops every app, answering once they're stopped; the tray then stops the daemon.
  quit: async (_input, ctx) => {
    const { jobs } = ctx.services;
    const jobId = jobs.start('pause_all', { payload: { via: 'tray', untilRestart: true } });
    await jobs.settled(jobId).catch(() => undefined);
    return { ok: true as const };
  },

  // US-SYS-42: "Use port 8443" while another program holds hlabs's web port.
  useOtherPort: async (_input, ctx) => {
    const { db, system, routing } = ctx.services;
    const problem = routing.portProblem();
    if (problem) {
      await useOtherPort(
        { db, portInUse: (port) => system.portInUse(port), apply: () => routing.sync({ force: true }) },
        problem,
      );
    }
    return { ok: true as const };
  },

  // US-INST-02, US-INST-24: the tokenised setup URL the tray opens and `hlabs setup-url` prints; null once onboarding is
  // complete (D-013, D-035).
  setupUrl: (_input, ctx) => setupUrls(ctx.services),
};
