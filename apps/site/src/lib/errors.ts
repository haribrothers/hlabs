// The error pages (US-SITE-09, D-147): the dashboard's words for each code (src/data/errors.json, exported from
// apps/web by `pnpm --filter @hlabs/web errors:export`) and the troubleshooting page that explains more, if any.
import errors from '../data/errors.json';

export interface ErrorPage {
  code: string;
  slug: string;
  title: string;
  body: string;
}

export const errorPages: ErrorPage[] = errors;

/** Codes whose cause has its own troubleshooting page. */
const MORE: Array<[RegExp, { href: string; label: string }]> = [
  [/^(APP_)?DISK_FULL$/, { href: '/help/troubleshooting/disk-full/', label: 'Out of disk space' }],
  [
    /^NAS_|^STORAGE_LOCATION_UNREACHABLE$|^BACKUP_DEST/,
    { href: '/help/troubleshooting/nas-unreachable/', label: 'A network drive can’t be reached' },
  ],
  [/^ENGINE_/, { href: '/help/troubleshooting/engine-stopped/', label: 'The container engine stopped' }],
  [/PORT_IN_USE$/, { href: '/help/troubleshooting/port-in-use/', label: 'Another program is using hlabs’s port' }],
  [/^UPDATE_|^APP_UPDATE/, { href: '/help/troubleshooting/update-rolled-back/', label: 'An update rolled back' }],
  [/^DAEMON_/, { href: '/help/get-started/cant-reach/', label: 'Can’t reach hlabs' }],
];

export function moreFor(code: string): { href: string; label: string } | null {
  return MORE.find(([pattern]) => pattern.test(code))?.[1] ?? null;
}
