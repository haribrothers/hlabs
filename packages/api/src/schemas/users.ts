import { z } from 'zod';
import { io } from '../trpc';
import { appIdSchema, displayNameSchema, empty, idSchema, ok, pending, roleSchema } from './common';

const userRef = z.object({ userId: idSchema });

export const peoplePolicySchema = z.object({
  showUserList: z.boolean(),
  requireTotp: z.boolean(),
  membersCanInstall: z.boolean(),
  membersCanSeeUsage: z.boolean(),
});

export const users = {
  list: io(empty, pending),
  get: io(userRef, pending),
  updateRole: io(userRef.extend({ role: roleSchema }), ok),
  disable: io(userRef, ok),
  enable: io(userRef, ok),
  resetPasswordLink: io(userRef, z.object({ url: z.string(), expiresAt: z.number() })),
  delete: io(userRef.extend({ keepHomeFolder: z.boolean().default(false) }), ok),
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
  displayName: displayNameSchema.optional(),
  role: roleSchema,
  appIds: z.array(appIdSchema).default([]),
});

export const invites = {
  create: io(inviteFields, z.object({ inviteId: idSchema, url: z.string(), expiresAt: z.number() })),
  list: io(empty, pending),
  update: io(inviteFields.partial().extend({ inviteId: idSchema }), ok),
  revoke: io(z.object({ inviteId: idSchema }), ok),
  inspect: io(z.object({ token: z.string().min(1) }), pending),
  accept: io(
    z.object({ token: z.string().min(1), username: z.string(), displayName: displayNameSchema, password: z.string() }),
    z.object({ redirectTo: z.string() }),
  ),
};
