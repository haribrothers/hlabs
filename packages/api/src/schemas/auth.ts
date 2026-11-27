import { z } from 'zod';
import { io } from '../trpc';
import { accentSchema, wallpaperSchema } from './settings';
import {
  displayNameSchema,
  empty,
  idSchema,
  ok,
  passwordSchema,
  roleSchema,
  timestampSchema,
  totpCodeSchema,
  usernameSchema,
} from './common';

/** One account on the log-in screen (US-AUTH-01): nothing more than the list needs. */
export const loginUserSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  role: roleSchema,
  avatarColor: z.string().nullable(),
});

/** Per-user look (D-010): Settings › Appearance changes it (US-ACCT-32…35); the shell and Home apply it. */
export const appearanceSchema = z.object({
  wallpaper: wallpaperSchema,
  /** The person's own photo (`GET /api/appearance/wallpaper?v=<uploadedAt>`); null until they upload one. */
  customWallpaperUrl: z.string().nullable(),
  accent: accentSchema,
  reduceTransparency: z.boolean(),
  /** null: never set, so the device's own reduce-motion setting decides (US-ACCT-35). */
  reduceMotion: z.boolean().nullable(),
  showWidgets: z.boolean(),
  showGreeting: z.boolean(),
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const meSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  role: roleSchema,
  avatarColor: z.string().nullable(),
  locale: z.string(),
  mustSetupTotp: z.boolean(),
  /** Two-factor login is on for this account. */
  totpEnabled: z.boolean(),
  /** Usage in the Dock: admins, or members when both the policy and their own switch allow (D-029, US-HOME-05). */
  canSeeUsage: z.boolean(),
  /** App Store in the Dock: admins, or members when "Members can install apps" is on (US-HOME-05). */
  canInstallApps: z.boolean(),
  /** "Shared with me" in Files: admins, or members with "See the Shared folder in Files" (US-FILE-01). */
  canSeeShared: z.boolean(),
  /** This session was started with "Remember me" (US-AUTH-14). */
  remember: z.boolean(),
  appearance: appearanceSchema,
  /** Send as `x-hlabs-csrf` on every mutation (07 §7.3). */
  csrfToken: z.string(),
  /**
   * Where this request came from (US-SYS-46, D-182): `public` through the public dashboard (where home-only controls
   * show "At home only", US-SYS-47), `tailnet`, or `home`. Always sent (optional only for older test fixtures).
   */
  via: z.enum(['home', 'tailnet', 'public']).optional(),
});

const redirectSchema = z.object({ redirectTo: z.string() });

export const auth = {
  listLoginUsers: io(
    empty,
    z.object({
      users: z.array(loginUserSchema),
      /**
       * Where the log-in screen was opened from (US-SYS-46, D-185): `public` shows the public dashboard's sign-in
       * (`LoginPublic`: a username typed, no "Remember me"). Always sent (optional only for older test fixtures).
       */
      via: z.enum(['home', 'tailnet', 'public']).optional(),
    }),
  ),
  login: io(
    z.object({
      username: z.string().min(1).max(64),
      password: passwordSchema,
      remember: z.boolean().default(false),
      next: z.string().optional(),
    }),
    z.discriminatedUnion('status', [
      z.object({ status: z.literal('ok'), redirectTo: z.string() }),
      z.object({ status: z.literal('totp_required'), challengeId: idSchema }),
    ]),
  ),
  verifyTotp: io(z.object({ challengeId: idSchema, code: totpCodeSchema }), redirectSchema),
  useRecoveryCode: io(
    z.object({ challengeId: idSchema, code: z.string().min(1).max(64) }),
    /** `recoveryCodesLeft`: unused codes after this one (US-AUTH-09). */
    redirectSchema.extend({ recoveryCodesLeft: z.number().int().min(0) }),
  ),
  logout: io(empty, ok),
  /**
   * Already signed in, on the way to `next` (an app that didn't see the session): the cookie is set again for the
   * name the dashboard is on, so apps under it share it (D-105), and the allowed `next` comes back.
   */
  continue: io(z.object({ next: z.string().max(2048).optional() }), redirectSchema),
  me: io(empty, meSchema),
  listSessions: io(
    empty,
    z.object({
      items: z.array(
        z.object({
          id: idSchema,
          current: z.boolean(),
          userAgent: z.string().nullable(),
          ip: z.string().nullable(),
          createdAt: timestampSchema,
          lastSeenAt: timestampSchema,
          /**
           * A sign-in on a public app's address (`photos.example.com`, D-178), valid there only; null for the
           * dashboard. Always sent (optional only for older test fixtures).
           */
          publicHost: z.string().nullable().optional(),
          /** `publicHost` is the public dashboard's address ("Public dashboard at hlabs.example.com", US-SYS-46). */
          publicDashboard: z.boolean().optional(),
        }),
      ),
    }),
  ),
  revokeSession: io(z.object({ sessionId: idSchema }), ok),
  /**
   * "Sign out everywhere" (US-SYS-46, the new-sign-in notification): ends every session of mine but this one, home,
   * tailnet and public addresses alike; audited. Never home-only.
   */
  revokeOtherSessions: io(empty, z.object({ ended: z.number().int().nonnegative() })),
  /**
   * A new password from an admin's one-time link (US-AUTH-22). Signs them in on this device, unless they have two-factor:
   * then they log in with the new password and their code (D-114).
   */
  resetPassword: io(
    z.object({ token: z.string().min(1), newPassword: passwordSchema }),
    z.object({ loggedIn: z.boolean(), username: usernameSchema }),
  ),
};
