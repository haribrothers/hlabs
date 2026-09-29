// The network storage form (US-ONB-16): parsing the address and placing the daemon's errors on the right field.
import { onboardingCopy } from '../copy/onboarding';

const copy = onboardingCopy.storage.nasForm;

export type NasProtocol = 'smb' | 'nfs';

/**
 * "nas.local/media", "smb://nas.local/media" or "\\nas\media" → { host, share }. NFS exports keep their leading
 * slash: "nas.local:/export/media" or "nas.local/export/media" → share "/export/media".
 */
export function parseNasAddress(protocol: NasProtocol, text: string): { host: string; share: string } | null {
  const clean = text
    .trim()
    .replace(/^(smb|nfs|cifs):\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  // The host, then "/" or ":" (NFS), then the share.
  const match = clean.match(/^([A-Za-z0-9._-]+)(?::\/?|\/)(.+)$/);
  if (!match) return null;
  const host = match[1]!;
  const path = match[2]!.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!path) return null;
  return { host, share: protocol === 'nfs' ? `/${path}` : path };
}

export type NasField = 'address' | 'username' | 'password' | 'form';

/** The field and message for a daemon refusal (hlabsCode and detail.reason). */
export function nasFieldError(
  code: string | undefined,
  reason: string | undefined,
  where: { host: string; share: string },
): { field: NasField; message: string } {
  switch (code) {
    case 'NAS_AUTH_FAILED':
      return { field: 'password', message: copy.authFailed };
    case 'NAS_READ_ONLY':
      return { field: 'address', message: copy.readOnly };
    case 'NAS_HELPER_MISSING':
      return { field: 'form', message: copy.helperMissing };
    case 'NAS_UNREACHABLE':
      if (reason === 'noShare') return { field: 'address', message: copy.noShare(where.share, where.host) };
      if (reason === 'privilegedPort') return { field: 'address', message: copy.privilegedPort };
      return { field: 'address', message: copy.unreachable(where.host) };
    default:
      return { field: 'form', message: onboardingCopy.storage.failed };
  }
}
