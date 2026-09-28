import { z } from 'zod';
import { io } from '../trpc';
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

/** Avatar colours (the design system's four accents). */
export const avatarColorSchema = z.enum(['violet', 'mint', 'amber', 'rose']);
/** Languages the dashboard speaks: English only in v1 (01-tech-stack). */
export const localeSchema = z.enum(['en']);

export const account = {
  /** The signed-in person's own account (US-ACCT-03 onwards). */
  get: io(
    empty,
    z.object({
      id: idSchema,
      username: usernameSchema,
      displayName: displayNameSchema,
      role: roleSchema,
      avatarColor: z.string().nullable(),
      locale: z.string(),
      passwordChangedAt: timestampSchema.nullable(),
      totpEnabledAt: timestampSchema.nullable(),
      recoveryCodesUnused: z.number().int().nonnegative(),
      /** Size of the person's Home folder; null until Files (phase 5). */
      homeFolderBytes: z.number().nonnegative().nullable(),
      /** An admin's display name, for "ask <admin>" copy. */
      adminName: z.string().nullable(),
    }),
  ),
  update: io(
    z.object({
      displayName: displayNameSchema.optional(),
      avatarColor: avatarColorSchema.optional(),
      locale: localeSchema.optional(),
    }),
    ok,
  ),
  changePassword: io(z.object({ currentPassword: passwordSchema, newPassword: passwordSchema }), ok),
  totp: {
    begin: io(
      z.object({ password: passwordSchema }),
      z.object({ otpauthUrl: z.string(), qrSvg: z.string(), secret: z.string() }),
    ),
    confirm: io(z.object({ code: totpCodeSchema }), z.object({ recoveryCodes: z.array(z.string()) })),
    disable: io(z.object({ password: passwordSchema }), ok),
  },
  recoveryCodes: {
    regenerate: io(z.object({ password: passwordSchema }), z.object({ recoveryCodes: z.array(z.string()) })),
  },
};
