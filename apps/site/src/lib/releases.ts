// What the download page offers (US-SITE-02), from src/data/releases.json (written by scripts/site-releases.ts when
// the site builds). Files are told apart by their names (D-146): hlabs-<v>-mac-arm64.dmg, hlabs-<v>-linux-x86_64.deb…
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatBytes } from '@hlabs/shared';
import type { SiteFile, SiteRelease, SiteReleases } from '../../../../scripts/site-releases-lib.ts';

export type { SiteFile, SiteRelease, SiteReleases };

export function siteReleases(): SiteReleases {
  const file = resolve(process.env.HLABS_SITE_RELEASES_JSON ?? resolve(process.cwd(), 'src/data/releases.json'));
  const empty: SiteReleases = { repo: 'haribrothers/hlabs', stable: null, beta: null, installScript: null };
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as SiteReleases) : empty;
}

export interface Download {
  name: string;
  url: string;
  size: string;
  sha256: string | null;
}

export type Arch = 'x86_64' | 'aarch64';

export interface Channel {
  version: string;
  /** "18 November 2026". */
  date: string;
  url: string;
  macArm: Download | null;
  macIntel: Download | null;
  linux: Record<Arch, { deb: Download | null; rpm: Download | null; appimage: Download | null }>;
}

const toDownload = (f: SiteFile | undefined): Download | null =>
  f ? { name: f.name, url: f.url, size: formatBytes(f.size), sha256: f.sha256 } : null;

export function channelOf(r: SiteRelease | null): Channel | null {
  if (!r) return null;
  const find = (suffix: string) => toDownload(r.files.find((f) => f.name === `hlabs-${r.version}-${suffix}`));
  const linux = (arch: Arch) => ({
    deb: find(`linux-${arch}.deb`),
    rpm: find(`linux-${arch}.rpm`),
    appimage: find(`linux-${arch}.AppImage`),
  });
  const date = r.date
    ? new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  return {
    version: r.version,
    date,
    url: r.url,
    macArm: find('mac-arm64.dmg'),
    macIntel: find('mac-x64.dmg'),
    linux: { x86_64: linux('x86_64'), aarch64: linux('aarch64') },
  };
}

export const allReleasesUrl = (repo: string) => `https://github.com/${repo}/releases`;
