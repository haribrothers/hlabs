import { z } from 'zod';
import { io } from '../trpc';
import { empty, hostnameSchema, jobRefSchema, ok } from './common';

const portSchema = z.number().int().min(1).max(65535);

/** How hlabs is reached at home (US-SYS-01). */
export const homeNetworkSchema = z.object({
  hostname: z.string(),
  /** `https://hlabs.local`, with the port when 443 was taken (D-016). */
  localAddress: z.string(),
  /** `https://hlabs.home.arpa`: the name for devices that use the local DNS server (D-105). */
  dnsAddress: z.string(),
  /** Whether the `.local` name is published with mDNS. */
  published: z.boolean(),
  /** This computer's LAN IPv4 addresses, best first. */
  lanAddresses: z.array(z.string()),
  /** `https://<LAN IP>[:port]` while the name isn't published. */
  fallbackAddress: z.string().nullable(),
});

/** Remote access (US-SYS-02…04, D-102…D-107). */
export const remoteStatusSchema = z.object({
  mode: z.enum(['off', 'tailscale', 'subnetRouter']),
  /**
   * off · not_installed · stopped (installed, not running) · waiting (for the log-in) · timed_out (10 minutes) ·
   * connected · logged_out (was connected; Tailscale is signed out) · https_disabled (the tailnet has no certificates)
   */
  state: z.enum([
    'off',
    'not_installed',
    'stopped',
    'waiting',
    'timed_out',
    'connected',
    'logged_out',
    'https_disabled',
  ]),
  tailnet: z.string().nullable(),
  nodeName: z.string().nullable(),
  /** The dashboard on the tailnet, while connected. */
  url: z.string().nullable(),
  /** The Tailscale log-in page, while waiting. */
  loginUrl: z.string().nullable(),
  /** When this computer's Tailscale key expires (ms). */
  keyExpiry: z.number().nullable(),
});
export type RemoteStatus = z.infer<typeof remoteStatusSchema>;

export const networkStatusSchema = z.object({
  home: homeNetworkSchema,
  remote: remoteStatusSchema,
  /** The web ports in use, after any fallback (D-016). */
  ports: z.object({ https: portSchema, http: portSchema }),
});
export type NetworkStatus = z.infer<typeof networkStatusSchema>;

export const network = {
  status: io(empty, networkStatusSchema),
  setHostname: io(z.object({ hostname: hostnameSchema }), jobRefSchema),
  remote: {
    /**
     * Connect with Tailscale (US-SYS-02): `confirm` names the tailnet first when Tailscale is already signed in
     * (D-102); `dashboardPort` 8443 after a clash on 443 (D-103).
     */
    connect: io(
      z
        .object({
          confirmTailnet: z.boolean().optional(),
          dashboardPort: z.union([z.literal(443), z.literal(8443)]).optional(),
        })
        .optional(),
      z.discriminatedUnion('state', [
        z.object({ state: z.literal('not_installed') }),
        z.object({ state: z.literal('stopped') }),
        z.object({ state: z.literal('needs_login'), loginUrl: z.string().nullable() }),
        z.object({ state: z.literal('confirm'), tailnet: z.string(), nodeName: z.string() }),
        z.object({ state: z.literal('connected'), url: z.string() }),
      ]),
    ),
    disconnect: io(empty, ok),
  },
  caCertificate: io(empty, z.object({ pem: z.string(), fingerprint: z.string() })),
  /** The web ports, and the raw ports apps publish, listed so a change doesn't clash (US-SYS-05). */
  ports: io(
    empty,
    z.object({
      https: portSchema,
      http: portSchema,
      appPorts: z.array(
        z.object({
          appId: z.string(),
          appName: z.string(),
          port: portSchema,
          protocol: z.enum(['tcp', 'udp']),
          label: z.string(),
        }),
      ),
    }),
  ),
  setPorts: io(z.object({ https: portSchema, http: portSchema }), ok),
  setPiholeDns: io(z.object({ enabled: z.boolean() }), ok),
};
