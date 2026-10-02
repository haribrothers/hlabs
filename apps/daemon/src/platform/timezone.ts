// This computer's time zone for apps (`TZ`, 06 §Variables), as a current IANA name. Node's ICU still reports some
// legacy ids ("Asia/Calcutta"), which newer tz databases in app images don't know, so the /etc/localtime link (macOS
// and most Linux) comes first. Reading the link is behind a parameter so tests don't touch the system.
import { readlinkSync } from 'node:fs';

/** ICU's legacy ids that the IANA database renamed; apps built on current tzdata may not accept the old ones. */
const RENAMED: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'America/Godthab': 'America/Nuuk',
};

const IANA = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$|^UTC$/;

export interface TimeZoneSources {
  env?: string | undefined;
  readLink?: () => string | null;
  intl?: () => string | undefined;
}

export function hostTimeZone(sources: TimeZoneSources = {}): string {
  const env = sources.env ?? process.env.TZ;
  if (env && IANA.test(env)) return RENAMED[env] ?? env;
  const link = (sources.readLink ?? readLocaltime)();
  const fromLink = link?.split('/zoneinfo/')[1];
  if (fromLink && IANA.test(fromLink)) return RENAMED[fromLink] ?? fromLink;
  const intl = (sources.intl ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone))();
  return intl ? (RENAMED[intl] ?? intl) : 'UTC';
}

function readLocaltime(): string | null {
  try {
    return readlinkSync('/etc/localtime');
  } catch {
    return null;
  }
}
