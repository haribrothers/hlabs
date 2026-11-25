// Public apps through Cloudflare Tunnel (US-APP-27…29, US-SYS-43, 44; D-150, D-171, D-178; 07 §7.10). Admins only:
// members can't make anything public and never see Visits (enforced in PublicService).
import { z } from 'zod';
import { io } from '../trpc';
import { appIdSchema, empty, jobRefSchema, ok, timestampSchema } from './common';

/** Who gets into a public app (US-APP-28): hlabs's login with two-factor, or the app's own login only. */
export const publicAccessSchema = z.enum(['hlabs', 'ownLogin']);
export type PublicAccess = z.infer<typeof publicAccessSchema>;

/** One label under the Cloudflare domain (`photos` → `photos.example.com`): Cloudflare's certificate covers one level. */
export const publicLabelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

/** An app's public address, as `apps.get`, `apps.list` and `public.status` give it; null while it's private. */
export const appPublicSchema = z.object({
  /** `https://photos.example.com` */
  address: z.string(),
  /** `photos.example.com` */
  hostname: z.string(),
  access: publicAccessSchema,
  /** When it was made public (ms). */
  since: timestampSchema,
  /** The display name of the admin who made it public; null once that account is gone. */
  by: z.string().nullable(),
});
export type AppPublic = z.infer<typeof appPublicSchema>;

/** Cloudflare Tunnel's state (US-SYS-43). */
export const cloudflareStateSchema = z.enum(['off', 'signingIn', 'settingUp', 'on', 'error']);
export type CloudflareState = z.infer<typeof cloudflareStateSchema>;

export const cloudflareStatusSchema = z.object({
  /**
   * `off`: not set up ("Set up Cloudflare Tunnel…"); `signingIn`: waiting for the admin in Cloudflare's tab;
   * `settingUp`: the `public_setup` job is making the tunnel and starting its connector; `on`: set up; `error`: set up
   * but not working (`reason`), or the last setup failed.
   */
  state: cloudflareStateSchema,
  /** The domain public apps get names under (`example.com`); null until chosen. */
  domain: z.string().nullable(),
  /** While `signingIn`: Cloudflare's sign-in link, to open again. */
  signInUrl: z.string().nullable(),
  /** The setup job while `settingUp` (its `job.progress` messages are the steps), or the last one that failed. */
  jobId: z.string().nullable(),
  /**
   * Why it's `error`: `connector` (cloudflared isn't running or keeps stopping), `credentialMissing` (the keychain item
   * is gone, as after a restore on another computer), or the step a setup failed at (`signIn`, `token`, `tunnel`…).
   */
  reason: z.string().nullable(),
  /** How hlabs got its credential; null when not set up. */
  credential: z.enum(['signIn', 'token']).nullable(),
  /** When it was set up (ms), and by whom (display name); null when not set up. */
  setUpAt: timestampSchema.nullable(),
  setUpBy: z.string().nullable(),
});
export type CloudflareStatus = z.infer<typeof cloudflareStatusSchema>;

/** A row in Settings › Network › Public apps (US-SYS-44). */
export const publicAppRowSchema = appPublicSchema.extend({
  appId: appIdSchema,
  /** The manifest's name: "Immich". */
  name: z.string(),
  icon: z.object({
    logoUrl: z.string().nullable(),
    gradient: z.tuple([z.string(), z.string()]).nullable(),
    fallback: z.string().nullable(),
  }),
});
export type PublicAppRow = z.infer<typeof publicAppRowSchema>;

/** A visit's outcome (US-APP-29). */
export const visitResultSchema = z.enum(['signedIn', 'askedToSignIn', 'refused', 'tooManyTries']);
export type VisitResult = z.infer<typeof visitResultSchema>;

export const visitSchema = z.object({
  at: timestampSchema,
  /** The visitor's address, from Cloudflare (`CF-Connecting-IP`). */
  ip: z.string(),
  /** Two-letter country code from Cloudflare (`CF-IPCountry`); null when it didn't say. */
  country: z.string().nullable(),
  method: z.string(),
  /** The path asked for, without the query. */
  path: z.string(),
  status: z.number().int(),
  result: visitResultSchema,
});
export type Visit = z.infer<typeof visitSchema>;

/** What "Make public…" needs to know (AppPublic, US-APP-27, US-APP-28). */
export const publicOptionsSchema = z.object({
  /** The Cloudflare domain, or null when public access isn't set up ("Set up public access in Settings › Network"). */
  domain: z.string().nullable(),
  /** A free label suggested from the app's name (`immich`), or its current one while public. */
  suggestedLabel: z.string(),
  /** Labels other public apps use. */
  taken: z.array(z.string()),
  /** False: "<App> can't be made public: …" with `reason` (null: "it can control your other apps"). */
  allowed: z.boolean(),
  reason: z.string().nullable(),
  /** The manifest's `public.ownLoginSafe`: "<App>'s own login only" is offered. */
  ownLoginSafe: z.boolean(),
  /** Category `media`: the dialog adds Cloudflare's terms on streaming video (D-171). */
  media: z.boolean(),
  /** Everyone allowed into the app (admins, and members it's shared with), and whether each has two-factor on. */
  people: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      avatarColor: z.string().nullable(),
      role: z.enum(['admin', 'member']),
      totpEnabled: z.boolean(),
    }),
  ),
  /** Its current public address, when it is public ("Change…"). */
  current: appPublicSchema.nullable(),
});
export type PublicOptions = z.infer<typeof publicOptionsSchema>;

export const publicAccess = {
  status: io(
    empty,
    z.object({
      cloudflare: cloudflareStatusSchema,
      /** Every public app, newest first. */
      apps: z.array(publicAppRowSchema),
    }),
  ),
  /**
   * "Sign in to Cloudflare" (D-171): starts `cloudflared tunnel login` and answers with Cloudflare's sign-in link,
   * which the dashboard opens in a new tab. `public.status` is `signingIn` until the admin approves a domain there,
   * then `settingUp` (the `public_setup` job), then `on`. A second call while signing in gives the same link.
   */
  cloudflareSignIn: io(empty, z.object({ url: z.string() })),
  /** Stops waiting for Cloudflare's sign-in ("Cancel" while waiting). */
  cancelSignIn: io(empty, ok),
  /**
   * "Use an API token instead": checked at once (`CLOUDFLARE_FAILED { step: 'token' }` when Cloudflare refuses it,
   * `{ step: 'zone' }` when it doesn't cover `domain`), kept in the keychain, then the `public_setup` job.
   */
  setupCloudflare: io(
    z.object({
      domain: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
      token: z.string().trim().min(20).max(400),
    }),
    jobRefSchema,
  ),
  /** "Remove Cloudflare Tunnel" (`public_remove`): every public app private first, then the tunnel, its DNS records and
   * the credential. */
  remove: io(empty, jobRefSchema),
  /** "Turn off all public access" (`public_off_all`): every public app private; the tunnel stays set up. */
  turnOffAll: io(empty, jobRefSchema),
};

/** `apps.*` additions (US-APP-27…29). */
export const appsPublic = {
  /**
   * Makes an app public at `<label>.<domain>` with `access` (default `hlabs`), changes its label or access while it's
   * public, or (`public: false`) makes it private, as a `public_on` / `public_off` job. `ownLogin` needs the manifest's
   * `public.ownLoginSafe` and `understood: true` ("I understand").
   */
  setPublic: io(
    z.object({
      appId: appIdSchema,
      public: z.boolean(),
      hostname: publicLabelSchema.optional(),
      access: publicAccessSchema.optional(),
      understood: z.boolean().optional(),
    }),
    jobRefSchema,
  ),
  publicOptions: io(z.object({ appId: appIdSchema }), publicOptionsSchema),
  /**
   * Requests to the app's public address in the last 7 days, newest first (Caddy's access log, D-178), 50 a page.
   * `refused`: addresses refused right now after too many failed sign-ins (US-APP-29).
   */
  publicVisits: io(
    z.object({
      appId: appIdSchema,
      result: visitResultSchema.optional(),
      cursor: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    z.object({
      items: z.array(visitSchema),
      nextCursor: z.string().nullable(),
      refused: z.array(z.object({ ip: z.string(), until: timestampSchema, failures: z.number().int() })),
    }),
  ),
};
