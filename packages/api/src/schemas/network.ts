import { z } from 'zod';
import { io } from '../trpc';
import { empty, hostnameSchema, jobRefSchema, ok, pending } from './common';

const portSchema = z.number().int().min(1).max(65535);

export const network = {
  status: io(empty, pending),
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
