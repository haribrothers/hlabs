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

export const networkStatusSchema = z.object({
  home: homeNetworkSchema,
  /** The web ports in use, after any fallback (D-016). */
  ports: z.object({ https: portSchema, http: portSchema }),
});
export type NetworkStatus = z.infer<typeof networkStatusSchema>;

export const network = {
  status: io(empty, networkStatusSchema),
  setHostname: io(z.object({ hostname: hostnameSchema }), jobRefSchema),
  remote: {
    connect: io(empty, z.object({ loginUrl: z.string().nullable() })),
    disconnect: io(empty, ok),
  },
  caCertificate: io(empty, z.object({ pem: z.string(), fingerprint: z.string() })),
  ports: io(empty, z.object({ https: portSchema, http: portSchema })),
  setPorts: io(z.object({ https: portSchema, http: portSchema }), ok),
  setPiholeDns: io(z.object({ enabled: z.boolean() }), ok),
};
