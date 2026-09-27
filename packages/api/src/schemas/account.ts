import { z } from 'zod';
import { io } from '../trpc';
import { displayNameSchema, empty, ok, passwordSchema, pending, totpCodeSchema } from './common';

export const account = {
  get: io(empty, pending),
  update: io(
    z.object({
      displayName: displayNameSchema.optional(),
      avatarColor: z.string().optional(),
      locale: z.string().optional(),
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
