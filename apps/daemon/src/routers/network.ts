import { hlabsError, type AppHandlers } from '@hlabs/api';
import { getSetting } from '@hlabs/db';
import type { DaemonContext } from '../context';
import { appRawPorts, setWebPorts } from '../network/ports';

const who = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, ip: ctx.request.ip };
};

export const network: AppHandlers<DaemonContext>['network'] = {
  /** How hlabs is reached (US-SYS-01): its home-network addresses and web ports. */
  status: async (input, ctx) => {
    const { routing, remote, db } = ctx.services;
    const remoteStatus = input?.probe === false ? remote.saved() : await remote.status();
    return {
      home: routing.homeNetwork(),
      remote: remoteStatus,
      dns: ctx.services.dns.status(),
      ports: getSetting(db, 'network').ports,
    };
  },
  /** Choose the local DNS server (US-SYS-06); the earlier one loses what hlabs wrote. */
  setDnsServer: async (input, ctx) => {
    await ctx.services.dns.choose(input, who(ctx));
    return { ok: true as const };
  },
  testDnsServer: async ({ address, appPassword }, ctx) => {
    await ctx.services.dns.test(address, appPassword);
    return { ok: true as const };
  },
  /** A subnet router reaches hlabs instead of Tailscale here (US-SYS-41), or back to Connect. */
  setRemoteMode: async ({ mode }, ctx) => {
    ctx.services.remote.setMode(mode, who(ctx));
    return { ok: true as const };
  },
  remote: {
    /** Connect with Tailscale (US-SYS-02); the dashboard opens the log-in page and asks status every 2 s. */
    connect: (input, ctx) => ctx.services.remote.connect(input ?? {}, who(ctx)),
    /** Disconnect (US-SYS-03): only hlabs's Serve entries go; tailnet sessions end. */
    disconnect: async (_input, ctx) => {
      await ctx.services.remote.disconnect(who(ctx));
      return { ok: true as const };
    },
  },
  ports: (_input, ctx) => ({ ...getSetting(ctx.services.db, 'network').ports, appPorts: appRawPorts(ctx.services.db) }),
  /** New web ports, checked free; Caddy listens on them straight away (US-SYS-05). */
  setPorts: async (input, ctx) => {
    const { db, system, routing } = ctx.services;
    await setWebPorts(
      { db, portInUse: (port) => system.portInUse(port), apply: () => routing.sync({ force: true }) },
      input,
      who(ctx),
    );
    return { ok: true as const };
  },
};
