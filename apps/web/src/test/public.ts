// Public apps in tests (US-SYS-43, 44, US-APP-27…29): `public.status`, `apps.publicOptions` and jobs as the daemon
// answers them.
import type { AppPublic, CloudflareStatus, Job, PublicAppRow, PublicOptions } from '@hlabs/api';

export const DAY = 86_400_000;
/** 3 Dec 2026, 12:00 local. */
export const SINCE = new Date(2026, 11, 3, 12).getTime();

export const cloudflare = (over: Partial<CloudflareStatus> = {}): CloudflareStatus => ({
  state: 'off',
  domain: null,
  signInUrl: null,
  jobId: null,
  reason: null,
  credential: null,
  setUpAt: null,
  setUpBy: null,
  ...over,
});

export const cloudflareOn = (over: Partial<CloudflareStatus> = {}) =>
  cloudflare({ state: 'on', domain: 'example.com', credential: 'signIn', setUpAt: SINCE, setUpBy: 'Hari', ...over });

export const appPublic = (over: Partial<AppPublic> = {}): AppPublic => ({
  address: 'https://photos.example.com',
  hostname: 'photos.example.com',
  access: 'hlabs',
  since: SINCE,
  by: 'Hari',
  ...over,
});

export const publicRow = (over: Partial<PublicAppRow> = {}): PublicAppRow => ({
  appId: 'immich',
  name: 'Immich',
  icon: { logoUrl: null, gradient: null, fallback: null },
  ...appPublic(),
  ...over,
});

export const jellyfinRow = () =>
  publicRow({
    appId: 'jellyfin',
    name: 'Jellyfin',
    address: 'https://jellyfin.example.com',
    hostname: 'jellyfin.example.com',
    access: 'ownLogin',
    by: 'Asha',
    since: SINCE - 2 * DAY,
  });

export const status = (cf: CloudflareStatus = cloudflare(), apps: PublicAppRow[] = []) => ({ cloudflare: cf, apps });

export const person = (id: string, displayName: string, totpEnabled: boolean, role: 'admin' | 'member' = 'admin') => ({
  id,
  displayName,
  avatarColor: null,
  role,
  totpEnabled,
});

export const publicOptions = (over: Partial<PublicOptions> = {}): PublicOptions => ({
  domain: 'example.com',
  suggestedLabel: 'immich',
  taken: [],
  allowed: true,
  reason: null,
  ownLoginSafe: false,
  media: false,
  people: [person('u1', 'Hari', true), person('u2', 'Asha', true), person('u3', 'Ravi', false, 'member')],
  current: null,
  ...over,
});

export const job = (over: Partial<Job> = {}): Job => ({
  id: 'job1',
  kind: 'public_on',
  target: 'immich',
  state: 'succeeded',
  progress: 100,
  message: null,
  hlabsCode: null,
  createdAt: 1,
  finishedAt: 2,
  ...over,
});
