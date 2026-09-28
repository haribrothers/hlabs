import { z } from 'zod';
import { io } from '../trpc';
import { accentSchema } from './settings';
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

/** Per-user look (D-010): Settings › Appearance changes it (phase 7); Home applies it (US-HOME-01). */
export const appearanceSchema = z.object({
  wallpaper: z.string(),
  accent: accentSchema,
  reduceTransparency: z.boolean(),
  reduceMotion: z.boolean(),
  showWidgets: z.boolean(),
  showGreeting: z.boolean(),
});

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
  /** This session was started with "Remember me" (US-AUTH-14). */
  remember: z.boolean(),
  appearance: appearanceSchema,
  /** Send as `x-hlabs-csrf` on every mutation (07 §7.3). */
  csrfToken: z.string(),
});

const redirectSchema = z.object({ redirectTo: z.string() });

export const auth = {
  listLoginUsers: io(empty, z.object({ users: z.array(loginUserSchema) })),
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
        }),
      ),
    }),
  ),
  revokeSession: io(z.object({ sessionId: idSchema }), ok),
  resetPassword: io(z.object({ token: z.string().min(1), newPassword: passwordSchema }), ok),
};
