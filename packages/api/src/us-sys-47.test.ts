// US-SYS-47 · Some changes only work at home: every procedure chooses. A new procedure fails this test until it's in
// HOME_ONLY_PROCEDURES (@hlabs/shared, refused from the public dashboard with HOME_ONLY) or on the list below of what
// works from anywhere, public dashboard included (D-182, 07 §7.11 control 5).
import { HOME_ONLY_PROCEDURES, isHomeOnly } from '@hlabs/shared';
import { describe, expect, it } from 'vitest';
import { listProcedures } from './procedures';

// Works from the public dashboard too. The tray's (tray.*) never come through Caddy at all: the tray token is refused
// on any request that was proxied (US-INST-15).
// prettier-ignore
const WORKS_ANYWHERE = [
  'system.health', 'system.info', 'system.restartDaemon', 'system.logs', 'system.diagnostics', 'system.connections',
  'onboarding.status',
  'auth.listLoginUsers', 'auth.login', 'auth.verifyTotp', 'auth.useRecoveryCode', 'auth.logout', 'auth.continue', 'auth.me', 'auth.listSessions', 'auth.revokeSession', 'auth.revokeOtherSessions',
  'account.get', 'account.update',
  'users.list', 'users.get', 'users.disable', 'users.getPolicy',
  'invites.list', 'invites.revoke',
  'store.getHome', 'store.listApps', 'store.getApp', 'store.listCategories', 'store.listUpdates', 'store.sources.list', 'store.sources.sync',
  'apps.list', 'apps.get', 'apps.install', 'apps.retryInstall', 'apps.start', 'apps.stop', 'apps.restart', 'apps.update', 'apps.updateAll', 'apps.uninstall', 'apps.reinstall', 'apps.getConfig', 'apps.setAutostart', 'apps.setAutoUpdate', 'apps.logs', 'apps.watchLogs', 'apps.widgetKey', 'apps.setWidgetKey', 'apps.publicOptions', 'apps.publicVisits',
  'public.status', 'public.cancelSignIn', 'public.turnOffAll',
  'home.getLayout', 'home.saveLayout', 'home.saveDock', 'home.listWidgets', 'home.getWidgetData', 'home.searchEverything',
  'files.list', 'files.stat', 'files.recent', 'files.listTrash', 'files.openWith', 'files.preview', 'files.search', 'files.mkdir', 'files.rename', 'files.move', 'files.copy', 'files.trash', 'files.uploads', 'files.delete', 'files.restoreFromTrash', 'files.emptyTrash', 'files.shares.get', 'files.shares.set', 'files.shares.remove',
  'storage.summary', 'storage.listDrives', 'storage.locations.list', 'storage.locations.reconnect', 'storage.locations.discover', 'storage.locations.testNetwork', 'storage.locations.addNetwork', 'storage.locations.remove', 'storage.locations.eject', 'storage.moveAllPlan', 'storage.pruneImages',
  'usage.overview', 'usage.current', 'usage.history', 'usage.memoryByApp', 'usage.topApps', 'usage.appDetail',
  'backups.overview', 'backups.destinations.list', 'backups.destinations.test', 'backups.plan.get', 'backups.plan.update', 'backups.plan.estimate', 'backups.runNow', 'backups.listRuns', 'backups.getRun', 'backups.listSnapshots', 'backups.getSnapshot', 'backups.getRestore',
  'network.status', 'network.caCertificate', 'network.ports',
  'settings.get', 'settings.appearance.update', 'settings.notifications.update', 'settings.notifications.test', 'settings.engine.get', 'settings.engine.setResources', 'settings.engine.planSwitch', 'settings.engine.restart', 'settings.engine.start', 'settings.startup.update', 'settings.updates.get', 'settings.updates.check', 'settings.updates.setChannel', 'settings.updates.setAuto', 'settings.updates.install',
  'notifications.list', 'notifications.unreadCount', 'notifications.markRead', 'notifications.markAllRead', 'notifications.dismiss',
  'jobs.get', 'jobs.list', 'jobs.cancel',
  'ai.get', 'ai.setEnabled', 'ai.setPermissions', 'ai.activity', 'ai.tokens.list', 'ai.tokens.revoke',
  'tray.status', 'tray.listUsers', 'tray.quickAction', 'tray.resetPassword', 'tray.quit', 'tray.useOtherPort', 'tray.setStartAtLogin', 'tray.appLogs', 'tray.startEngine', 'tray.diagnostics', 'tray.uninstallInfo', 'tray.uninstall', 'tray.setupUrl', 'tray.job', 'tray.libraryKeygen', 'tray.librarySign', 'tray.publicOff',
  'events.stream',
];

describe('US-SYS-47', () => {
  it('every procedure is either home-only or listed as working from anywhere, never both', () => {
    const paths = listProcedures().map((p) => p.path);
    const homeOnly = Object.keys(HOME_ONLY_PROCEDURES);
    const unchosen = paths.filter((p) => !homeOnly.includes(p) && !WORKS_ANYWHERE.includes(p));
    expect(unchosen, 'add each to HOME_ONLY_PROCEDURES or WORKS_ANYWHERE').toEqual([]);
    expect(homeOnly.filter((p) => WORKS_ANYWHERE.includes(p))).toEqual([]);
    // No stale names in either list.
    expect([...homeOnly, ...WORKS_ANYWHERE].filter((p) => !paths.includes(p))).toEqual([]);
  });

  it("is exactly the story's list: the riskiest changes, setup, invites and reset links", () => {
    const always = (path: string) => isHomeOnly(path, {});
    for (const path of [
      'system.factoryReset',
      'public.setupCloudflare',
      'public.remove',
      'public.setDashboardAccess',
      'network.setHostname',
      'network.remote.connect',
      'network.setPorts',
      'network.setDnsServer',
      'store.sources.add',
      'store.sources.remove',
      'store.copyToLibrary',
      'apps.deployCustom',
      'apps.setPermissions',
      'apps.revealSecret',
      'invites.create',
      'users.updateRole',
      'users.delete',
      'users.resetPasswordLink',
      'users.updatePolicy',
      'account.changePassword',
      'account.totp.begin',
      'account.totp.disable',
      'account.recoveryCodes.regenerate',
      'backups.restore',
      'backups.destinations.remove',
      'backups.exportRepoPassword',
      'storage.moveAll',
      'apps.moveData',
      'settings.engine.switch',
      'onboarding.createAdmin',
      'invites.accept',
      'auth.resetPassword',
    ])
      expect(always(path), path).toBe(true);
  });

  it('stopping exposure is never home-only: making things private, turning it all off, signing out everywhere', () => {
    expect(isHomeOnly('apps.setPublic', { appId: 'immich', public: false })).toBe(false);
    expect(isHomeOnly('public.setDashboard', { public: false })).toBe(false);
    expect(isHomeOnly('apps.setPublic', { appId: 'immich', public: true })).toBe(true);
    expect(isHomeOnly('public.setDashboard', { public: true, hostname: 'hlabs', password: 'x' })).toBe(true);
    // The control that makes something public (no input yet) is home-only.
    expect(isHomeOnly('apps.setPublic')).toBe(true);
    for (const path of ['public.turnOffAll', 'auth.revokeOtherSessions', 'auth.revokeSession', 'auth.logout'])
      expect(isHomeOnly(path), path).toBe(false);
  });

  it('listProcedures says which rule each procedure has', () => {
    const byPath = new Map(listProcedures().map((p) => [p.path, p.homeOnly]));
    expect(byPath.get('system.factoryReset')).toBe('always');
    expect(byPath.get('apps.setPublic')).toBe('makingPublic');
    expect(byPath.get('auth.resetPassword')).toBe('neverServed');
    expect(byPath.get('files.list')).toBeNull();
  });
});
