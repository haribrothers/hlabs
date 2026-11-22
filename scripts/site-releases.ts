// Before the website builds (D-147, US-SITE-02, US-SITE-05): the latest stable and beta releases from GitHub, with
// each file's size and SHA-256 (from the release's SHA256SUMS), into apps/site/src/data/releases.json; and the latest
// stable release's install.sh with its .sig into apps/site/public/, plus install.sh.sha256 (the beta's, until there's
// a stable release). install.sh comes from the release, never from main, and must match the release's SHA256SUMS.
//
//   node scripts/site-releases.ts                        GitHub (GITHUB_TOKEN is used when set)
//   HLABS_SITE_RELEASES_FIXTURE=<dir> node scripts/…     <dir>/releases.json (GitHub's shape) and <dir>/assets/<tag>/*
//
// Without the network the site still builds, saying there's no release yet. On CI, Cloudflare's build included
// (it sets CI=true, D-147), that fails instead, so the live site keeps its download page.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { installScriptRelease, latestReleases, type GitHubRelease, type SiteReleases } from './site-releases-lib.ts';

const root = resolve(import.meta.dirname, '..');
const site = join(root, 'apps/site');
// The site's tests put both somewhere of their own (apps/site/e2e/build.ts).
const out = resolve(process.env.HLABS_SITE_RELEASES_JSON ?? join(site, 'src/data/releases.json'));
const publicDir = resolve(process.env.HLABS_SITE_PUBLIC_DIR ?? join(site, 'public'));
const REPO = process.env.HLABS_REPO ?? 'haribrothers/hlabs';
const fixture = process.env.HLABS_SITE_RELEASES_FIXTURE;
const say = (line: string) => void process.stdout.write(`${line}\n`);

async function fetchOk(url: string, accept = 'application/octet-stream'): Promise<Response> {
  const headers: Record<string, string> = { accept, 'user-agent': 'hlabs-site-build' };
  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/')) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res;
}

async function listReleases(): Promise<GitHubRelease[]> {
  if (fixture) return JSON.parse(readFileSync(join(fixture, 'releases.json'), 'utf8')) as GitHubRelease[];
  const res = await fetchOk(`https://api.github.com/repos/${REPO}/releases?per_page=50`, 'application/vnd.github+json');
  return (await res.json()) as GitHubRelease[];
}

async function asset(release: GitHubRelease, name: string): Promise<Buffer | null> {
  const found = release.assets.find((a) => a.name === name);
  if (!found) return null;
  if (fixture) {
    const file = join(fixture, 'assets', release.tag_name, name);
    return existsSync(file) ? readFileSync(file) : null;
  }
  return Buffer.from(await (await fetchOk(found.browser_download_url)).arrayBuffer());
}

const INSTALL_FILES = ['install.sh', 'install.sh.sig', 'install.sh.sha256'];
const clearInstall = () => INSTALL_FILES.forEach((f) => rmSync(join(publicDir, f), { force: true }));

async function main() {
  const releases = await listReleases();
  const data: SiteReleases = await latestReleases(releases, REPO, async (r) => {
    const sums = await asset(r, 'SHA256SUMS');
    return sums?.toString('utf8') ?? null;
  });

  // install.sh, from the latest stable release (the beta until there is one), checked against its SHA256SUMS.
  clearInstall();
  const from = installScriptRelease(data);
  const stable = from ? releases.find((r) => r.tag_name === from.tag) : undefined;
  if (stable && from) {
    const script = await asset(stable, 'install.sh');
    const sig = await asset(stable, 'install.sh.sig');
    const listed = from.files.find((f) => f.name === 'install.sh')?.sha256;
    if (script && sig) {
      const sha = createHash('sha256').update(script).digest('hex');
      if (!listed || listed !== sha) {
        throw new Error(`install.sh in ${stable.tag_name} doesn't match its SHA256SUMS: not publishing it`);
      }
      mkdirSync(publicDir, { recursive: true });
      writeFileSync(join(publicDir, 'install.sh'), script);
      writeFileSync(join(publicDir, 'install.sh.sig'), sig);
      writeFileSync(join(publicDir, 'install.sh.sha256'), `${sha}  install.sh\n`);
      data.installScript = { version: from.version, sha256: sha };
      say(`install.sh from ${stable.tag_name} (${sha.slice(0, 12)}…)`);
    } else {
      say(`${stable.tag_name} has no signed install.sh: the site serves none`);
    }
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
  say(
    `releases.json: stable ${data.stable?.version ?? 'none'}, beta ${data.beta?.version ?? 'none'}${fixture ? ' (fixture)' : ''}`,
  );
}

main().catch((err: Error) => {
  process.stderr.write(`Couldn't read the releases: ${err.message}\n`);
  if (process.env.CI || fixture) process.exit(1);
  // Offline on a laptop: keep what's there, or say there's no release yet.
  if (!existsSync(out)) {
    clearInstall();
    mkdirSync(dirname(out), { recursive: true });
    const empty: SiteReleases = { repo: REPO, stable: null, beta: null, installScript: null };
    writeFileSync(out, `${JSON.stringify(empty, null, 2)}\n`);
  }
  process.stderr.write('The site builds with the releases it had (or none).\n');
});
