import { z } from 'zod';
import { io } from '../trpc';
import {
  displayNameSchema,
  empty,
  idSchema,
  ok,
  passwordSchema,
  pending,
  roleSchema,
  timestampSchema,
  totpCodeSchema,
  usernameSchema,
} from './common';

export const loginUserSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  avatarColor: z.string().nullable(),
});

export const meSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  role: roleSchema,
  avatarColor: z.string().nullable(),
  locale: z.string(),
  mustSetupTotp: z.boolean(),
  appearance: pending,
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
  useRecoveryCode: io(z.object({ challengeId: idSchema, code: z.string().min(1).max(64) }), redirectSchema),
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
