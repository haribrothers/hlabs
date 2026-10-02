import { z } from 'zod';
import { io } from '../trpc';
import { appIdSchema, displayNameSchema, empty, idSchema, ok, roleSchema, timestampSchema } from './common';

const userRef = z.object({ userId: idSchema });

export const peoplePolicySchema = z.object({
  showUserList: z.boolean(),
  requireTotp: z.boolean(),
  membersCanInstall: z.boolean(),
  membersCanSeeUsage: z.boolean(),
});
export type PeoplePolicy = z.infer<typeof peoplePolicySchema>;

/** A row in Settings › Users (US-ACCT-13). `appCount` counts `app_access` rows; it means something for members only. */
export const userSummarySchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  role: roleSchema,
  avatarColor: z.string().nullable(),
  totpEnabled: z.boolean(),
  lastActiveAt: timestampSchema.nullable(),
  disabled: z.boolean(),
  appCount: z.number().int().nonnegative(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/** A pending invite (US-ACCT-17): unused, not revoked, not expired. `url` is the link first created. */
export const pendingInviteSchema = z.object({
  id: idSchema,
  role: roleSchema,
  displayName: z.string().nullable(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  url: z.string().nullable(),
});
export type PendingInvite = z.infer<typeof pendingInviteSchema>;

/** The public invite page (US-AUTH-23, US-ACCT-23): nothing about the invite beyond what it shows. */
export const inviteInspectSchema = z.object({
  status: z.enum(['valid', 'expired', 'used', 'revoked']),
  /** Who made the invite; null for an unknown link or when that admin is gone. */
  inviterName: z.string().nullable(),
  inviterAvatarColor: z.string().nullable(),
  /** "Their name", pre-filling the form; only while the invite is valid. */
  displayName: z.string().nullable(),
  role: roleSchema.nullable(),
  /** Installed apps shared with a member invite. */
  appCount: z.number().int().nonnegative(),
});
export type InviteInspect = z.infer<typeof inviteInspectSchema>;

export const users = {
  list: io(empty, z.object({ users: z.array(userSummarySchema) })),
  get: io(
    userRef,
    z.object({
      id: idSchema,
      username: z.string(),
      displayName: z.string(),
      role: roleSchema,
      avatarColor: z.string().nullable(),
      /** Apps in `app_access` (ignored while the person is an admin). */
      appIds: z.array(appIdSchema),
      canSeeShared: z.boolean(),
      canSeeUsage: z.boolean(),
      /** Their Home folder's size; null while it's first being counted (US-ACCT-16). */
      homeFolderBytes: z.number().nonnegative().nullable(),
    }),
  ),
  updateRole: io(userRef.extend({ role: roleSchema }), ok),
  disable: io(userRef, ok),
  enable: io(userRef, ok),
  resetPasswordLink: io(userRef, z.object({ url: z.string(), expiresAt: z.number() })),
  /** `jobId` when their Home folder goes to the trash too (US-ACCT-16). */
  delete: io(
    userRef.extend({ deleteHomeFolder: z.boolean().default(false) }),
    z.object({ jobId: idSchema.nullable() }),
  ),
  setAppAccess: io(
    userRef.extend({
      appIds: z.array(appIdSchema),
      canSeeShared: z.boolean().optional(),
      canSeeUsage: z.boolean().optional(),
    }),
    ok,
  ),
  getPolicy: io(empty, peoplePolicySchema),
  updatePolicy: io(peoplePolicySchema.partial(), peoplePolicySchema),
};

const inviteFields = z.object({
  /** "Their name (optional)": empty clears it (US-ACCT-21). */
  displayName: z.string().trim().max(40).optional(),
  role: roleSchema,
  appIds: z.array(appIdSchema).default([]),
});

export const invites = {
  create: io(inviteFields, z.object({ inviteId: idSchema, url: z.string(), expiresAt: z.number() })),
  list: io(empty, z.object({ invites: z.array(pendingInviteSchema) })),
  // No defaults here: a field that isn't sent stays as it is.
  update: io(
    z.object({
      inviteId: idSchema,
      displayName: inviteFields.shape.displayName,
      role: roleSchema.optional(),
      appIds: z.array(appIdSchema).optional(),
    }),
    ok,
  ),
  revoke: io(z.object({ inviteId: idSchema }), ok),
  inspect: io(z.object({ token: z.string().min(1).max(128) }), inviteInspectSchema),
  accept: io(
    z.object({ token: z.string().min(1), username: z.string(), displayName: displayNameSchema, password: z.string() }),
    z.object({ redirectTo: z.string() }),
  ),
};
