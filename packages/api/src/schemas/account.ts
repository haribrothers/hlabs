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
      /** One entry per recovery code slot, in order: true once that code was used (US-ACCT-09). */
      recoveryCodesUsed: z.array(z.boolean()),
      /** Two-factor was turned on during setup ("Added when you set up hlabs", US-ACCT-08). */
      totpAddedDuringSetup: z.boolean(),
      /** An admin requires two-factor for everyone: it can't be turned off (US-ACCT-12). */
      totpRequired: z.boolean(),
      /** This hlabs's name, for the recovery codes file (US-ACCT-09). */
      hostname: z.string(),
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
    /** After the password: a pending secret (10 minutes) to turn two-factor on, or to move it to a new phone. */
    begin: io(z.object({ password: passwordSchema }), z.object({ otpauthUrl: z.string(), secret: z.string() })),
    /** Turning on: 10 new recovery codes. Moving: none (the codes are kept). */
    confirm: io(z.object({ code: totpCodeSchema }), z.object({ recoveryCodes: z.array(z.string()) })),
    /** Turn two-factor off (US-ACCT-12): the password and a current 6-digit code or a recovery code. */
    disable: io(z.object({ password: passwordSchema, code: z.string().min(1).max(64) }), ok),
  },
  recoveryCodes: {
    regenerate: io(z.object({ password: passwordSchema }), z.object({ recoveryCodes: z.array(z.string()) })),
  },
};
