import type { NetworkStatus } from '@hlabs/api';

/** No local DNS server chosen (US-SYS-06), for `network.status` fakes. */
export const fakeDns = (extra: Partial<NetworkStatus['dns']> = {}): NetworkStatus['dns'] => ({
  kind: 'none',
  address: null,
  adguardInstalled: false,
  lastSyncAt: null,
  problem: null,
  records: [],
  ...extra,
});
