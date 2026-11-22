// Which releases the website offers (D-147), without the network: the newest stable and the newest of all (beta),
// each file with its size and SHA-256 from the release's SHA256SUMS.

export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: Array<{ name: string; size: number; browser_download_url: string }>;
}

export interface SiteFile {
  name: string;
  size: number;
  url: string;
  sha256: string | null;
}

export interface SiteRelease {
  tag: string;
  version: string;
  /** yyyy-mm-dd. */
  date: string;
  url: string;
  files: SiteFile[];
}

export interface SiteReleases {
  repo: string;
  stable: SiteRelease | null;
  /** The newest release of either channel: stable releases go to beta too (D-146). */
  beta: SiteRelease | null;
  /** The install.sh this site serves: the stable release's, or the beta's until there's a stable release. */
  installScript: { version: string; sha256: string } | null;
}

const VERSION = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Newer first; a prerelease comes before the release it leads to (1.2.0-beta.1 < 1.2.0). */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a.startsWith('v') ? a : `v${a}`);
  const pb = VERSION.exec(b.startsWith('v') ? b : `v${b}`);
  if (!pa || !pb) throw new Error(`Not versions: ${a}, ${b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pb[i]) - Number(pa[i]);
    if (d) return d;
  }
  const [ra, rb] = [pa[4], pb[4]];
  if (!ra || !rb) return ra ? 1 : rb ? -1 : 0;
  const xa = ra.split('.');
  const xb = rb.split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const [ca, cb] = [xa[i], xb[i]];
    if (ca === undefined) return 1;
    if (cb === undefined) return -1;
    const [na, nb] = [Number(ca), Number(cb)];
    const d = Number.isNaN(na) || Number.isNaN(nb) ? cb.localeCompare(ca) : nb - na;
    if (d) return d;
  }
  return 0;
}

/** `sha256sum` lines → name → hash. */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (m) sums.set(m[2]!, m[1]!);
  }
  return sums;
}

export async function latestReleases(
  releases: GitHubRelease[],
  repo: string,
  checksumsOf: (r: GitHubRelease) => Promise<string | null>,
): Promise<SiteReleases> {
  // The rolling `beta` release only holds the beta channel's latest.json (D-146).
  const real = releases
    .filter((r) => !r.draft && VERSION.test(r.tag_name))
    .sort((a, b) => compareVersions(a.tag_name, b.tag_name));
  const describe = async (r: GitHubRelease | undefined): Promise<SiteRelease | null> => {
    if (!r) return null;
    const text = await checksumsOf(r);
    const sums = text ? parseChecksums(text) : new Map<string, string>();
    return {
      tag: r.tag_name,
      version: r.tag_name.slice(1),
      date: (r.published_at ?? '').slice(0, 10),
      url: r.html_url,
      files: r.assets
        .filter((a) => !a.name.endsWith('.sig'))
        .map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, sha256: sums.get(a.name) ?? null })),
    };
  };
  const stable = real.find((r) => !r.prerelease && !VERSION.exec(r.tag_name)![4]);
  return { repo, stable: await describe(stable), beta: await describe(real[0]), installScript: null };
}

/** The channel /download/ opens on: stable, or the beta while there's no stable release yet; null with neither. */
export function firstChannel(data: Pick<SiteReleases, 'stable' | 'beta'>): 'stable' | 'beta' | null {
  return data.stable ? 'stable' : data.beta ? 'beta' : null;
}

/** The release whose install.sh the site serves: the stable one, or the beta until there's a stable release. */
export function installScriptRelease(data: Pick<SiteReleases, 'stable' | 'beta'>): SiteRelease | null {
  return data.stable ?? data.beta;
}

/** The Linux server command for a channel (`--channel beta` installs the beta channel's version). */
export function installCommand(channel: 'stable' | 'beta'): string {
  const command = 'curl -fsSL https://hlabs.h4loom.com/install.sh | sh';
  return channel === 'beta' ? `${command} -s -- --channel beta` : command;
}
