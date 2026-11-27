// Taking secrets out of text that leaves the daemon (07 §7.7): hlabs's own logs in the viewer (US-SYS-27, masked as
// `••••`) and the diagnostics bundle (US-SYS-28, `[redacted]`, plus email and outside IP addresses, known secret
// values and usernames). The patterns are the "secret patterns list"; they're deliberately broad, since a line with too
// much hidden is better than a password shown.

/** What the log viewer shows in place of a secret. */
export const MASK = '••••';
/** What the diagnostics bundle has in place of anything removed. */
export const REDACTED = '[redacted]';

/** Names whose values are secret, in headers, JSON, URLs, env files and `key=value` text. */
const SECRET_NAME =
  '[A-Za-z0-9_.-]*(?:passw(?:or)?d|passphrase|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|auth[_-]?(?:key|token)|cookie|session[_-]?id|hlabs_session|credential|signature|csrf)[A-Za-z0-9_-]*';

/** The secret patterns list: each replaces the secret part of a match with the mask. */
function patterns(mask: string): Array<[RegExp, string | ((...m: string[]) => string)]> {
  return [
    // PEM private keys, whole.
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, mask],
    // Authorization schemes.
    [/\b(Bearer|Basic|Token|Digest)\s+[A-Za-z0-9._~+/=-]{4,}/gi, `$1 ${mask}`],
    // Credentials in an address: scheme://user:password@host.
    [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@"']+):[^\s@/"']+@/gi, `$1:${mask}@`],
    // Well-known token shapes, wherever they appear.
    [/\btskey-[A-Za-z0-9-]{8,}/g, mask],
    [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, mask],
    [/\bxox[abpr]-[A-Za-z0-9-]{10,}/g, mask],
    [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, mask],
    [/\bsk-[A-Za-z0-9_-]{16,}/g, mask],
    // JSON: "password": "…", "authorization": ["…"], "x-api-key": 123.
    [
      new RegExp(`("${SECRET_NAME}"\\s*:\\s*)(\\[\\s*)?("(?:[^"\\\\]|\\\\.)*"|[^,}\\]\\s]+)`, 'gi'),
      (_m: string, key: string, open?: string) => `${key}${open ?? ''}"${mask}"`,
    ],
    // The same inside a JSON string (a log line's message holding JSON): \"password\":\"…\".
    [
      new RegExp(`(\\\\"${SECRET_NAME}\\\\"\\s*:\\s*)\\\\"(?:[^"\\\\]|\\\\[^"])*\\\\"`, 'gi'),
      (_m: string, key: string) => `${key}\\"${mask}\\"`,
    ],
    // Cookies: hlabs_session=…; anything=… after "Cookie:" is handled by the header rule below.
    [/\b((?:hlabs_)?session=)[^;\s"',]+/gi, `$1${mask}`],
    // Headers and `name: value` text: Authorization: …, Cookie: …, x-hlabs-setup: …, password: …
    [new RegExp(`(\\b${SECRET_NAME}\\s*:\\s*)(?!\\s*")([^\\s,;"'}\\]][^,;"'}\\]\\n]*)`, 'gi'), `$1${mask}`],
    // `name=value` (env files, query strings, command lines): DB_PASSWORD=…, ?token=…, --api-key=…
    [new RegExp(`(\\b${SECRET_NAME}=)("[^"]*"|'[^']*'|[^\\s&"',;}\\]]+)`, 'gi'), `$1${mask}`],
  ];
}

const maskPatterns = new Map<string, ReturnType<typeof patterns>>();

/** Hides anything that looks like a password, token, key, cookie or Authorization header. */
export function maskSecrets(text: string, mask = MASK): string {
  let list = maskPatterns.get(mask);
  if (!list) maskPatterns.set(mask, (list = patterns(mask)));
  let out = text;
  for (const [re, by] of list) out = out.replace(re, by as string);
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Private, loopback and link-local IPv4 addresses: the home network, kept in a bundle. */
export function isLanIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a >= 224
  );
}

/** IPv6 outside the home network: global addresses (2000::/3). Loopback, link-local and unique local stay. */
function isPublicIpv6(text: string): boolean {
  return /^[23][0-9a-f]{3}:/i.test(text);
}

export interface BundleRedaction {
  /** Exact values to remove wherever they appear: secret env values, `.env` values, secret-store values. */
  secrets: readonly string[];
  /** hlabs usernames and display names, and this computer's account name: replaced by user1, user2… */
  people: readonly string[];
}

/**
 * Everything the diagnostics bundle removes (US-SYS-28): the secret patterns, known secret values, email addresses,
 * IP addresses outside the home network, and people's names (each the same `userN` throughout the bundle).
 */
export function bundleRedactor(ctx: BundleRedaction): (text: string) => string {
  // Longest first, so a value containing another is removed whole.
  const secrets = [...new Set(ctx.secrets.filter((s) => s.length >= 3))].sort((a, b) => b.length - a.length);
  const secretRe = secrets.length ? new RegExp(secrets.map(escapeRe).join('|'), 'g') : null;
  // Each name gets one alias whatever its case ("hari", "Hari"), numbered in the order given.
  const aliases = new Map<string, string>();
  for (const p of ctx.people.map((x) => x.trim()).filter((x) => x.length >= 2)) {
    if (!aliases.has(p.toLowerCase())) aliases.set(p.toLowerCase(), `user${aliases.size + 1}`);
  }
  const people = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const peopleRe = people.length
    ? new RegExp(`(?<![A-Za-z0-9])(?:${people.map(escapeRe).join('|')})(?![A-Za-z0-9])`, 'gi')
    : null;
  return (text: string) => {
    let out = text;
    if (secretRe) out = out.replace(secretRe, REDACTED);
    out = maskSecrets(out, REDACTED);
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, REDACTED);
    out = out.replace(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])/g, (ip) => (isLanIpv4(ip) ? ip : REDACTED));
    out = out.replace(/(?<![0-9A-Za-z:])([0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7})(?![0-9A-Za-z:])/gi, (ip) =>
      isPublicIpv6(ip) ? REDACTED : ip,
    );
    if (peopleRe) out = out.replace(peopleRe, (name) => aliases.get(name.toLowerCase()) ?? REDACTED);
    return out;
  };
}
