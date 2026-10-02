// The hlabs router tree (docs/prd/05-api.md, including "Contract additions from the feature files").
// Every procedure declares its access here; the daemon implements it through ctx.handle.
import type { TrackedEnvelope } from '@trpc/server';
import type { HlabsEvent } from './events';
import { eventsStreamInputSchema } from './events';
import * as s from './schemas/index';
import type { LogLine } from './schemas/index';
import { mutation as m, procedures as p, query as q, router, subscription } from './trpc';

export const appRouter = router({
  system: router({
    health: q(p.public, s.system.health),
    info: q(p.authed, s.system.info),
    restartDaemon: m(p.admin, s.system.restartDaemon),
    factoryReset: m(p.admin, s.system.factoryReset),
    logs: q(p.admin, s.system.logs),
    diagnostics: m(p.admin, s.system.diagnostics),
    connections: q(p.admin, s.system.connections),
  }),

  onboarding: router({
    status: q(p.public, s.onboarding.status),
    checkSystem: q(p.setup, s.onboarding.checkSystem),
    confirmSystem: m(p.setup, s.onboarding.confirmSystem),
    installEngine: m(p.setup, s.onboarding.installEngine),
    setStep: m(p.setup, s.onboarding.setStep),
    createAdmin: m(p.setup, s.onboarding.createAdmin),
    setupTotp: m(p.setup, s.onboarding.setupTotp),
    confirmTotp: m(p.setup, s.onboarding.confirmTotp),
    setStorage: m(p.setup, s.onboarding.setStorage),
    connectRemote: m(p.setup, s.onboarding.connectRemote),
    starterApps: q(p.setup, s.onboarding.starterApps),
    installStarterApps: m(p.setup, s.onboarding.installStarterApps),
    findBackups: q(p.setup, s.onboarding.findBackups),
    listRestorePoints: q(p.setup, s.onboarding.listRestorePoints),
    restoreFromBackup: m(p.setup, s.onboarding.restoreFromBackup),
    complete: m(p.setup, s.onboarding.complete),
  }),

  auth: router({
    listLoginUsers: q(p.public, s.auth.listLoginUsers),
    login: m(p.public, s.auth.login),
    verifyTotp: m(p.public, s.auth.verifyTotp),
    useRecoveryCode: m(p.public, s.auth.useRecoveryCode),
    resetPassword: m(p.public, s.auth.resetPassword),
    logout: m(p.authed, s.auth.logout),
    me: q(p.authed, s.auth.me),
    listSessions: q(p.authed, s.auth.listSessions),
    revokeSession: m(p.authed, s.auth.revokeSession),
  }),

  account: router({
    get: q(p.authed, s.account.get),
    update: m(p.authed, s.account.update),
    changePassword: m(p.authed, s.account.changePassword),
    totp: router({
      begin: m(p.authed, s.account.totp.begin),
      confirm: m(p.authed, s.account.totp.confirm),
      disable: m(p.authed, s.account.totp.disable),
    }),
    recoveryCodes: router({
      regenerate: m(p.authed, s.account.recoveryCodes.regenerate),
    }),
  }),

  users: router({
    list: q(p.admin, s.users.list),
    get: q(p.admin, s.users.get),
    updateRole: m(p.admin, s.users.updateRole),
    disable: m(p.admin, s.users.disable),
    enable: m(p.admin, s.users.enable),
    resetPasswordLink: m(p.admin, s.users.resetPasswordLink),
    delete: m(p.admin, s.users.delete),
    setAppAccess: m(p.admin, s.users.setAppAccess),
    getPolicy: q(p.admin, s.users.getPolicy),
    updatePolicy: m(p.admin, s.users.updatePolicy),
  }),

  invites: router({
    create: m(p.admin, s.invites.create),
    list: q(p.admin, s.invites.list),
    update: m(p.admin, s.invites.update),
    revoke: m(p.admin, s.invites.revoke),
    inspect: q(p.public, s.invites.inspect),
    accept: m(p.public, s.invites.accept),
  }),

  store: router({
    getHome: q(p.authed, s.store.getHome),
    listApps: q(p.authed, s.store.listApps),
    getApp: q(p.authed, s.store.getApp),
    listCategories: q(p.authed, s.store.listCategories),
    listUpdates: q(p.admin, s.store.listUpdates),
    sources: router({
      list: q(p.admin, s.store.sources.list),
      inspect: q(p.admin, s.store.sources.inspect),
      add: m(p.admin, s.store.sources.add),
      remove: m(p.admin, s.store.sources.remove),
      sync: m(p.admin, s.store.sources.sync),
    }),
  }),

  apps: router({
    // Members may list/get their apps and install when people.membersCanInstall is on (enforced in AppService).
    list: q(p.authed, s.apps.list),
    get: q(p.authed, s.apps.get),
    install: m(p.authed, s.apps.install),
    retryInstall: m(p.admin, s.apps.retryInstall),
    start: m(p.admin, s.apps.start),
    stop: m(p.admin, s.apps.stop),
    restart: m(p.admin, s.apps.restart),
    update: m(p.admin, s.apps.update),
    updateAll: m(p.admin, s.apps.updateAll),
    uninstall: m(p.admin, s.apps.uninstall),
    getConfig: q(p.admin, s.apps.getConfig),
    setConfig: m(p.admin, s.apps.setConfig),
    revealSecret: m(p.admin, s.apps.revealSecret),
    setMounts: m(p.admin, s.apps.setMounts),
    setPermissions: m(p.admin, s.apps.setPermissions),
    setAutostart: m(p.admin, s.apps.setAutostart),
    setAutoUpdate: m(p.admin, s.apps.setAutoUpdate),
    setAuthMode: m(p.admin, s.apps.setAuthMode),
    logs: q(p.admin, s.apps.logs),
    watchLogs: subscription<LogLine, typeof s.apps.watchLogsInput>(p.admin, s.apps.watchLogsInput),
    moveData: m(p.admin, s.apps.moveData),
    deployCustom: m(p.admin, s.apps.deployCustom),
  }),

  home: router({
    getLayout: q(p.authed, s.home.getLayout),
    saveLayout: m(p.authed, s.home.saveLayout),
    saveDock: m(p.authed, s.home.saveDock),
    listWidgets: q(p.authed, s.home.listWidgets),
    getWidgetData: q(p.authed, s.home.getWidgetData),
    searchEverything: q(p.authed, s.home.searchEverything),
  }),

  files: router({
    list: q(p.authed, s.files.list),
    stat: q(p.authed, s.files.stat),
    recent: q(p.authed, s.files.recent),
    listTrash: q(p.authed, s.files.listTrash),
    openWith: q(p.authed, s.files.openWith),
    preview: q(p.authed, s.files.preview),
    search: q(p.authed, s.files.search),
    mkdir: m(p.authed, s.files.mkdir),
    rename: m(p.authed, s.files.rename),
    move: m(p.authed, s.files.move),
    copy: m(p.authed, s.files.copy),
    trash: m(p.authed, s.files.trash),
    restoreFromTrash: m(p.authed, s.files.restoreFromTrash),
    emptyTrash: m(p.authed, s.files.emptyTrash),
    shares: router({
      get: q(p.authed, s.files.shares.get),
      set: m(p.authed, s.files.shares.set),
      remove: m(p.authed, s.files.shares.remove),
    }),
  }),

  storage: router({
    summary: q(p.admin, s.storage.summary),
    listDrives: q(p.admin, s.storage.listDrives),
    locations: router({
      list: q(p.admin, s.storage.locations.list),
      discover: q(p.admin, s.storage.locations.discover),
      testNetwork: m(p.admin, s.storage.locations.testNetwork),
      addNetwork: m(p.admin, s.storage.locations.addNetwork),
      remove: m(p.admin, s.storage.locations.remove),
      eject: m(p.admin, s.storage.locations.eject),
    }),
    moveAllPlan: q(p.admin, s.storage.moveAllPlan),
    moveAll: m(p.admin, s.storage.moveAll),
    pruneImages: m(p.admin, s.storage.pruneImages),
  }),

  usage: router({
    // Members only when D-029 allows; enforced in UsageService.
    current: q(p.authed, s.usage.current),
    history: q(p.authed, s.usage.history),
    topApps: q(p.authed, s.usage.topApps),
    appDetail: q(p.admin, s.usage.appDetail),
  }),

  backups: router({
    overview: q(p.admin, s.backups.overview),
    destinations: router({
      list: q(p.admin, s.backups.destinations.list),
      test: m(p.admin, s.backups.destinations.test),
      add: m(p.admin, s.backups.destinations.add),
      update: m(p.admin, s.backups.destinations.update),
      remove: m(p.admin, s.backups.destinations.remove),
    }),
    plan: router({
      get: q(p.admin, s.backups.plan.get),
      update: m(p.admin, s.backups.plan.update),
      estimate: q(p.admin, s.backups.plan.estimate),
    }),
    runNow: m(p.admin, s.backups.runNow),
    listRuns: q(p.admin, s.backups.listRuns),
    getRun: q(p.admin, s.backups.getRun),
    listSnapshots: q(p.admin, s.backups.listSnapshots),
    getSnapshot: q(p.admin, s.backups.getSnapshot),
    restore: m(p.admin, s.backups.restore),
    exportRepoPassword: m(p.admin, s.backups.exportRepoPassword),
  }),

  network: router({
    status: q(p.admin, s.network.status),
    setHostname: m(p.admin, s.network.setHostname),
    remote: router({
      connect: m(p.admin, s.network.remote.connect),
      disconnect: m(p.admin, s.network.remote.disconnect),
    }),
    caCertificate: q(p.admin, s.network.caCertificate),
    ports: q(p.admin, s.network.ports),
    setPorts: m(p.admin, s.network.setPorts),
    setPiholeDns: m(p.admin, s.network.setPiholeDns),
  }),

  settings: router({
    get: q(p.authed, s.settings.get),
    appearance: router({
      update: m(p.authed, s.settings.appearance.update),
    }),
    notifications: router({
      // Members may change only their own notifications:<userId> switches (D-043).
      update: m(p.authed, s.settings.notifications.update),
      test: m(p.admin, s.settings.notifications.test),
    }),
    engine: router({
      get: q(p.admin, s.settings.engine.get),
      setResources: m(p.admin, s.settings.engine.setResources),
      planSwitch: q(p.admin, s.settings.engine.planSwitch),
      switch: m(p.admin, s.settings.engine.switch),
      restart: m(p.admin, s.settings.engine.restart),
      start: m(p.admin, s.settings.engine.start),
    }),
    startup: router({
      update: m(p.admin, s.settings.startup.update),
    }),
    updates: router({
      get: q(p.admin, s.settings.updates.get),
      check: m(p.admin, s.settings.updates.check),
      setChannel: m(p.admin, s.settings.updates.setChannel),
      setAuto: m(p.admin, s.settings.updates.setAuto),
      install: m(p.admin, s.settings.updates.install),
    }),
  }),

  notifications: router({
    list: q(p.authed, s.notifications.list),
    unreadCount: q(p.authed, s.notifications.unreadCount),
    markRead: m(p.authed, s.notifications.markRead),
    markAllRead: m(p.authed, s.notifications.markAllRead),
    dismiss: m(p.authed, s.notifications.dismiss),
  }),

  jobs: router({
    get: q(p.authed, s.jobs.get),
    list: q(p.authed, s.jobs.list),
    cancel: m(p.admin, s.jobs.cancel),
  }),

  ai: router({
    get: q(p.admin, s.ai.get),
    setEnabled: m(p.admin, s.ai.setEnabled),
    setPermissions: m(p.admin, s.ai.setPermissions),
    activity: q(p.admin, s.ai.activity),
    tokens: router({
      create: m(p.admin, s.ai.tokens.create),
      list: q(p.admin, s.ai.tokens.list),
      revoke: m(p.admin, s.ai.tokens.revoke),
    }),
  }),

  tray: router({
    status: q(p.tray, s.tray.status),
    listUsers: q(p.tray, s.tray.listUsers),
    quickAction: m(p.tray, s.tray.quickAction),
    resetPassword: m(p.tray, s.tray.resetPassword),
    setStartAtLogin: m(p.tray, s.tray.setStartAtLogin),
    appLogs: q(p.tray, s.tray.appLogs),
    startEngine: m(p.tray, s.tray.startEngine),
    diagnostics: q(p.tray, s.tray.diagnostics),
    uninstallInfo: q(p.tray, s.tray.uninstallInfo),
    uninstall: m(p.tray, s.tray.uninstall),
    setupUrl: q(p.tray, s.tray.setupUrl),
  }),

  events: router({
    stream: subscription<TrackedEnvelope<HlabsEvent>, typeof eventsStreamInputSchema>(
      p.authedOrTray,
      eventsStreamInputSchema,
    ),
  }),
});

export type AppRouter = typeof appRouter;
