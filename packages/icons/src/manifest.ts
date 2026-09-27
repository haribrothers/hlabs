import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #8b5cf6');

/**
 * The icon part of an App Store manifest (hlabs-app.yml → `icon`).
 *
 *   icon:
 *     logo: logo.svg            # square PNG or SVG, ≥256px, relative to the app folder or https URL
 *     gradient: ["#8b5cf6", "#4c1d95"]   # optional fallback tile, top-left → bottom-right
 *     fallback: film            # optional Lucide icon name (kebab-case) for the fallback tile
 */
export const AppIconManifest = z
  .object({
    logo: z.string().min(1).optional(),
    gradient: z.tuple([hex, hex]).optional(),
    fallback: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use a Lucide icon name in kebab-case, e.g. "film"')
      .optional(),
  })
  .strict();

export type AppIconManifest = z.infer<typeof AppIconManifest>;

/** What the daemon serves to the UI after resolving the manifest (logo becomes an absolute URL). */
export interface ResolvedAppIcon {
  logoUrl: string | null;
  gradient: readonly [string, string] | null;
  fallback: string | null;
}

/** Resolve a relative logo path against the app's asset base URL (e.g. /api/apps/jellyfin/assets/). */
export function resolveAppIcon(icon: AppIconManifest | undefined, assetBase: string): ResolvedAppIcon {
  const logo = icon?.logo;
  const logoUrl = !logo
    ? null
    : /^https:\/\//.test(logo)
      ? logo
      : new URL(logo, new URL(assetBase, 'http://x')).pathname;
  return { logoUrl, gradient: icon?.gradient ?? null, fallback: icon?.fallback ?? null };
}
