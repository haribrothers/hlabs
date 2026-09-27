// Field rules shared by every surface (onboarding, invites, account, tray reset).
import { z } from 'zod';

/** D-014: lowercase, starts with a letter, 3–32 characters, letters, numbers and dashes. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9-]{2,31}$/;
export const usernameSchema = z.string().regex(USERNAME_PATTERN);

/** D-044: display names are 1–40 characters after trimming. */
export const displayNameSchema = z.string().trim().min(1).max(40);

/** App hostnames and the dashboard name: lowercase letters, numbers and dashes (D-014, 04 invariant 3). */
export const HOSTNAME_PATTERN = /^[a-z0-9-]{1,40}$/;
export const hostnameSchema = z.string().regex(HOSTNAME_PATTERN);

/** App ids in manifests (docs/prd/06-app-manifest.md). */
export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}$/;
export const appIdSchema = z.string().regex(APP_ID_PATTERN);
