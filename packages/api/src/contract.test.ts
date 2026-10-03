// The router must match docs/prd/05-api.md: every procedure, its type and who may call it.
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { hlabsError, HLABS_ERRORS } from './errors';
import { EVENT_TYPES } from './events';
import { listProcedures } from './procedures';
import { appRouter } from './router';
import { createCallerFactory, type Access, type ApiContext } from './trpc';

type Row = [path: string, type: 'q' | 'm' | 's', access: Access | 'authed|tray'];

// prettier-ignore
const EXPECTED: Row[] = [
  ['system.health', 'q', 'public'], ['system.info', 'q', 'authed'], ['system.restartDaemon', 'm', 'admin'],
  ['system.factoryReset', 'm', 'admin'], ['system.logs', 'q', 'admin'], ['system.diagnostics', 'm', 'admin'],
  ['system.connections', 'q', 'admin'],

  ['onboarding.status', 'q', 'public'], ['onboarding.checkSystem', 'q', 'setup'], ['onboarding.confirmSystem', 'm', 'setup'],
  ['onboarding.installEngine', 'm', 'setup'], ['onboarding.setStep', 'm', 'setup'], ['onboarding.createAdmin', 'm', 'setup'],
  ['onboarding.setupTotp', 'm', 'setup'], ['onboarding.confirmTotp', 'm', 'setup'], ['onboarding.setStorage', 'm', 'setup'],
  ['onboarding.connectRemote', 'm', 'setup'], ['onboarding.starterApps', 'q', 'setup'],
  ['onboarding.installStarterApps', 'm', 'setup'],
  ['onboarding.findBackups', 'q', 'setup'], ['onboarding.listRestorePoints', 'q', 'setup'],
  ['onboarding.restoreFromBackup', 'm', 'setup'], ['onboarding.complete', 'm', 'setup'],

  ['auth.listLoginUsers', 'q', 'public'], ['auth.login', 'm', 'public'], ['auth.verifyTotp', 'm', 'public'],
  ['auth.useRecoveryCode', 'm', 'public'], ['auth.resetPassword', 'm', 'public'], ['auth.logout', 'm', 'authed'], ['auth.continue', 'm', 'authed'],
  ['auth.me', 'q', 'authed'], ['auth.listSessions', 'q', 'authed'], ['auth.revokeSession', 'm', 'authed'],

  ['account.get', 'q', 'authed'], ['account.update', 'm', 'authed'], ['account.changePassword', 'm', 'authed'],
  ['account.totp.begin', 'm', 'authed'], ['account.totp.confirm', 'm', 'authed'], ['account.totp.disable', 'm', 'authed'],
  ['account.recoveryCodes.regenerate', 'm', 'authed'],

  ['users.list', 'q', 'admin'], ['users.get', 'q', 'admin'], ['users.updateRole', 'm', 'admin'], ['users.disable', 'm', 'admin'],
  ['users.enable', 'm', 'admin'], ['users.resetPasswordLink', 'm', 'admin'], ['users.delete', 'm', 'admin'],
  ['users.setAppAccess', 'm', 'admin'], ['users.getPolicy', 'q', 'admin'], ['users.updatePolicy', 'm', 'admin'],

  ['invites.create', 'm', 'admin'], ['invites.list', 'q', 'admin'], ['invites.update', 'm', 'admin'],
  ['invites.revoke', 'm', 'admin'], ['invites.inspect', 'q', 'public'], ['invites.accept', 'm', 'public'],

  ['store.getHome', 'q', 'authed'], ['store.listApps', 'q', 'authed'], ['store.getApp', 'q', 'authed'],
  ['store.listCategories', 'q', 'authed'], ['store.listUpdates', 'q', 'admin'], ['store.sources.list', 'q', 'admin'],
  ['store.sources.inspect', 'q', 'admin'], ['store.sources.add', 'm', 'admin'], ['store.sources.remove', 'm', 'admin'],
  ['store.sources.sync', 'm', 'admin'],

  ['apps.list', 'q', 'authed'], ['apps.get', 'q', 'authed'], ['apps.install', 'm', 'authed'],
  ['apps.retryInstall', 'm', 'admin'], ['apps.start', 'm', 'admin'], ['apps.stop', 'm', 'admin'],
  ['apps.restart', 'm', 'admin'], ['apps.update', 'm', 'admin'], ['apps.updateAll', 'm', 'admin'],
  ['apps.uninstall', 'm', 'admin'], ['apps.getConfig', 'q', 'admin'], ['apps.setConfig', 'm', 'admin'],
  ['apps.revealSecret', 'm', 'admin'], ['apps.setMounts', 'm', 'admin'], ['apps.setPermissions', 'm', 'admin'],
  ['apps.setAutostart', 'm', 'admin'], ['apps.setAutoUpdate', 'm', 'admin'], ['apps.setAuthMode', 'm', 'admin'],
  ['apps.logs', 'q', 'admin'], ['apps.watchLogs', 's', 'admin'], ['apps.moveData', 'm', 'admin'],
  ['apps.deployCustom', 'm', 'admin'],

  ['home.getLayout', 'q', 'authed'], ['home.saveLayout', 'm', 'authed'], ['home.saveDock', 'm', 'authed'],
  ['home.listWidgets', 'q', 'authed'], ['home.getWidgetData', 'q', 'authed'], ['home.searchEverything', 'q', 'authed'],

  ['files.list', 'q', 'authed'], ['files.stat', 'q', 'authed'], ['files.recent', 'q', 'authed'],
  ['files.listTrash', 'q', 'authed'], ['files.openWith', 'q', 'authed'], ['files.preview', 'q', 'authed'],
  ['files.search', 'q', 'authed'], ['files.mkdir', 'm', 'authed'], ['files.rename', 'm', 'authed'],
  ['files.move', 'm', 'authed'], ['files.copy', 'm', 'authed'], ['files.trash', 'm', 'authed'],
  ['files.restoreFromTrash', 'm', 'authed'], ['files.emptyTrash', 'm', 'authed'], ['files.shares.get', 'q', 'authed'],
  ['files.shares.set', 'm', 'authed'], ['files.shares.remove', 'm', 'authed'],

  ['storage.summary', 'q', 'admin'], ['storage.listDrives', 'q', 'admin'], ['storage.locations.list', 'q', 'admin'],
  ['storage.locations.discover', 'q', 'admin'], ['storage.locations.testNetwork', 'm', 'admin'],
  ['storage.locations.addNetwork', 'm', 'admin'], ['storage.locations.remove', 'm', 'admin'],
  ['storage.locations.eject', 'm', 'admin'], ['storage.moveAllPlan', 'q', 'admin'], ['storage.moveAll', 'm', 'admin'],
  ['storage.pruneImages', 'm', 'admin'],

  ['usage.overview', 'q', 'authed'], ['usage.current', 'q', 'authed'], ['usage.history', 'q', 'authed'], ['usage.memoryByApp', 'q', 'authed'], ['usage.topApps', 'q', 'authed'],
  ['usage.appDetail', 'q', 'admin'],

  ['backups.overview', 'q', 'admin'], ['backups.destinations.list', 'q', 'admin'], ['backups.destinations.test', 'm', 'admin'],
  ['backups.destinations.add', 'm', 'admin'], ['backups.destinations.update', 'm', 'admin'],
  ['backups.destinations.remove', 'm', 'admin'], ['backups.plan.get', 'q', 'admin'], ['backups.plan.update', 'm', 'admin'],
  ['backups.plan.estimate', 'q', 'admin'], ['backups.runNow', 'm', 'admin'], ['backups.listRuns', 'q', 'admin'],
  ['backups.getRun', 'q', 'admin'], ['backups.listSnapshots', 'q', 'admin'], ['backups.getSnapshot', 'q', 'admin'],
  ['backups.restore', 'm', 'admin'], ['backups.exportRepoPassword', 'm', 'admin'],

  ['network.status', 'q', 'admin'], ['network.setHostname', 'm', 'admin'], ['network.remote.connect', 'm', 'admin'],
  ['network.remote.disconnect', 'm', 'admin'], ['network.caCertificate', 'q', 'admin'], ['network.ports', 'q', 'admin'],
  ['network.setPorts', 'm', 'admin'], ['network.setDnsServer', 'm', 'admin'], ['network.setRemoteMode', 'm', 'admin'], ['network.testDnsServer', 'm', 'admin'],

  ['settings.get', 'q', 'authed'], ['settings.appearance.update', 'm', 'authed'],
  ['settings.notifications.update', 'm', 'authed'], ['settings.notifications.test', 'm', 'admin'],
  ['settings.engine.get', 'q', 'admin'], ['settings.engine.setResources', 'm', 'admin'],
  ['settings.engine.planSwitch', 'q', 'admin'], ['settings.engine.switch', 'm', 'admin'],
  ['settings.engine.restart', 'm', 'admin'], ['settings.engine.start', 'm', 'admin'],
  ['settings.startup.update', 'm', 'admin'], ['settings.updates.get', 'q', 'admin'], ['settings.updates.check', 'm', 'admin'],
  ['settings.updates.setChannel', 'm', 'admin'], ['settings.updates.setAuto', 'm', 'admin'],
  ['settings.updates.install', 'm', 'admin'],

  ['notifications.list', 'q', 'authed'], ['notifications.unreadCount', 'q', 'authed'],
  ['notifications.markRead', 'm', 'authed'], ['notifications.markAllRead', 'm', 'authed'],
  ['notifications.dismiss', 'm', 'authed'],

  ['jobs.get', 'q', 'authed'], ['jobs.list', 'q', 'authed'], ['jobs.cancel', 'm', 'admin'],

  ['ai.get', 'q', 'admin'], ['ai.setEnabled', 'm', 'admin'], ['ai.setPermissions', 'm', 'admin'],
  ['ai.activity', 'q', 'admin'], ['ai.tokens.create', 'm', 'admin'], ['ai.tokens.list', 'q', 'admin'],
  ['ai.tokens.revoke', 'm', 'admin'],

  ['tray.status', 'q', 'tray'], ['tray.listUsers', 'q', 'tray'], ['tray.quickAction', 'm', 'tray'],
  ['tray.resetPassword', 'm', 'tray'], ['tray.quit', 'm', 'tray'], ['tray.setStartAtLogin', 'm', 'tray'], ['tray.appLogs', 'q', 'tray'],
  ['tray.startEngine', 'm', 'tray'], ['tray.diagnostics', 'q', 'tray'], ['tray.uninstallInfo', 'q', 'tray'],
  ['tray.uninstall', 'm', 'tray'], ['tray.setupUrl', 'q', 'tray'],

  ['events.stream', 's', 'authed|tray'],
];

const TYPE = { q: 'query', m: 'mutation', s: 'subscription' } as const;

describe('router contract (05-api)', () => {
  it('has exactly the documented procedures, types and access', () => {
    const actual = listProcedures().map((p) => [p.path, p.type, p.access.join('|')]);
    const expected = EXPECTED.map(([path, t, access]) => [path, TYPE[t], access]).sort((a, b) =>
      a[0]!.localeCompare(b[0]!),
    );
    expect(actual).toEqual(expected);
  });

  it('keeps public procedures to the list in 05 §Conventions', () => {
    const publicPaths = listProcedures()
      .filter((p) => p.access.includes('public'))
      .map((p) => p.path);
    expect(publicPaths.sort()).toEqual(
      [
        'system.health',
        'onboarding.status',
        'auth.listLoginUsers',
        'auth.login',
        'auth.verifyTotp',
        'auth.useRecoveryCode',
        'auth.resetPassword',
        'invites.inspect',
        'invites.accept',
      ].sort(),
    );
  });

  it('never gives the tray token anything but tray.* and events.stream (D-035)', () => {
    const trayPaths = listProcedures().filter((p) => p.access.includes('tray'));
    for (const p of trayPaths) expect(p.path === 'events.stream' || p.path.startsWith('tray.')).toBe(true);
  });
});

function fakeCtx(handle: ApiContext['handle']) {
  return {
    authorize: vi.fn<ApiContext['authorize']>(),
    handle,
    async *subscribe() {},
  };
}

describe('procedure plumbing', () => {
  const createCaller = createCallerFactory(appRouter);

  it('authorizes with the declared access before running the handler', async () => {
    const ctx = fakeCtx(async () => ({ status: 'ok', version: '0.0.0' }));
    await expect(createCaller(ctx).system.health()).resolves.toEqual({ status: 'ok', version: '0.0.0' });
    expect(ctx.authorize).toHaveBeenCalledWith(['public'], 'system.health');
  });

  it('stops at authorize when access is denied', async () => {
    const handle = vi.fn();
    const ctx = fakeCtx(handle);
    ctx.authorize.mockImplementation(() => {
      throw hlabsError('ACCESS_DENIED');
    });
    await expect(createCaller(ctx).users.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('validates input before the handler and output after it', async () => {
    const ctx = fakeCtx(async () => ({ status: 'nope' }));
    await expect(createCaller(ctx).system.health()).rejects.toBeInstanceOf(TRPCError);
    await expect(
      createCaller(fakeCtx(async () => ({ ok: true }))).apps.start({ appId: 'Not Valid!' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('puts the hlabsCode in the error shape', () => {
    const shape = appRouter._def._config.errorFormatter({
      error: hlabsError('AUTH_LOCKED', 'locked', { until: 1 }),
      type: 'mutation',
      path: 'auth.login',
      input: undefined,
      ctx: undefined,
      shape: { message: 'locked', code: -32029, data: { code: 'TOO_MANY_REQUESTS', httpStatus: 429 } },
    });
    expect(shape.data).toMatchObject({ hlabsCode: 'AUTH_LOCKED', detail: { until: 1 } });
  });
});

describe('catalogue', () => {
  it('uses the canonical names from 05 and never the retired ones', () => {
    expect(HLABS_ERRORS).toHaveProperty('JOB_EXCLUSIVE_RUNNING');
    expect(HLABS_ERRORS).toHaveProperty('PASSWORD_TOO_COMMON');
    expect(HLABS_ERRORS).toHaveProperty('USERNAME_TAKEN');
    expect(HLABS_ERRORS).not.toHaveProperty('JOB_CONFLICT');
    expect(HLABS_ERRORS).not.toHaveProperty('SYSTEM_BUSY');
  });

  it('covers every event in 02 §2.12', () => {
    expect(EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'system.status',
        'engine.status',
        'access.changed',
        'storage.locationChanged',
        'update.applyRequested',
        'startup.changeRequested',
        'app.stateChanged',
        'app.installProgress',
        'app.log',
        'job.progress',
        'job.finished',
        'backup.run',
        'notification.created',
        'usage.sample',
        'update.available',
        'session.revoked',
      ]),
    );
  });
});
