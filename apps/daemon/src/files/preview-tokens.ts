// Signed preview links (US-FILE-06): `/api/files/preview/<token>` names a virtual path for one person and lasts
// 5 minutes. The key lives only in memory, so links die with the daemon and the dashboard asks for new ones.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const PREVIEW_TTL_MS = 5 * 60_000;

interface Claims {
  /** User id. */
  u: string;
  /** Virtual path. */
  p: string;
  /** Expires, ms since the epoch. */
  e: number;
}

export type Verified = { userId: string; path: string } | 'expired' | null;

export class PreviewTokens {
  private readonly key = randomBytes(32);

  sign(userId: string, path: string, now = Date.now()): { token: string; expiresAt: number } {
    const claims: Claims = { u: userId, p: path, e: now + PREVIEW_TTL_MS };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { token: `${body}.${this.mac(body)}`, expiresAt: claims.e };
  }

  /** The person and path, 'expired' for a good token whose time is up, null for anything else. */
  verify(token: string, now = Date.now()): Verified {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const want = Buffer.from(this.mac(body));
    const got = Buffer.from(mac);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    let claims: Claims;
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Claims;
    } catch {
      return null;
    }
    if (typeof claims.u !== 'string' || typeof claims.p !== 'string' || typeof claims.e !== 'number') return null;
    if (now > claims.e) return 'expired';
    return { userId: claims.u, path: claims.p };
  }

  private mac(body: string) {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }
}

export const previewUrl = (token: string) => `/api/files/preview/${token}`;
