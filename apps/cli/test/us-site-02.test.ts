// US-SITE-02 · Download the right build: which releases the website offers (D-147), from GitHub's list. The page
// itself is tested in apps/site/e2e/us-site-02.spec.ts.
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  firstChannel,
  installCommand,
  installScriptRelease,
  latestReleases,
  parseChecksums,
  type GitHubRelease,
} from '../../../scripts/site-releases-lib';

const release = (tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease => ({
  tag_name: tag,
  draft: false,
  prerelease: tag.includes('-'),
  published_at: '2026-11-18T10:00:00Z',
  html_url: `https://github.com/x/y/releases/tag/${tag}`,
  assets: [
    { name: `hlabs-${tag.slice(1)}-mac-arm64.dmg`, size: 142_000_000, browser_download_url: `u/${tag}/dmg` },
    { name: `hlabs-${tag.slice(1)}-mac-arm64.dmg.sig`, size: 400, browser_download_url: `u/${tag}/dmg.sig` },
  ],
  ...extra,
});

describe('US-SITE-02', () => {
  it('orders versions newest first, a release after its own betas', () => {
    const sorted = ['v1.2.0-beta.1', 'v1.10.0', 'v1.2.0', 'v1.2.0-beta.10', 'v1.2.0-beta.2', 'v1.9.3'].sort(
      compareVersions,
    );
    expect(sorted).toEqual(['v1.10.0', 'v1.9.3', 'v1.2.0', 'v1.2.0-beta.10', 'v1.2.0-beta.2', 'v1.2.0-beta.1']);
  });

  it('reads SHA256SUMS', () => {
    const sums = parseChecksums(`${'a'.repeat(64)}  hlabs.dmg\n${'b'.repeat(64)} *install.sh\nnot a line\n`);
    expect(sums.get('hlabs.dmg')).toBe('a'.repeat(64));
    expect(sums.get('install.sh')).toBe('b'.repeat(64));
    expect(sums.size).toBe(2);
  });

  it('offers the newest stable and the newest of all as beta, never a draft or the rolling beta release', async () => {
    const data = await latestReleases(
      [
        release('v0.5.0'),
        release('v0.8.0', { draft: true }),
        release('beta', { prerelease: true }),
        release('v0.7.0-beta.1'),
        release('v0.6.0'),
      ],
      'x/y',
      async (r) => (r.tag_name === 'v0.6.0' ? `${'c'.repeat(64)}  hlabs-0.6.0-mac-arm64.dmg\n` : null),
    );
    expect(data.stable?.version).toBe('0.6.0');
    expect(data.stable?.date).toBe('2026-11-18');
    expect(data.beta?.version).toBe('0.7.0-beta.1');
    // Each file with its size and checksum; signatures aren't downloads.
    expect(data.stable?.files).toEqual([
      { name: 'hlabs-0.6.0-mac-arm64.dmg', size: 142_000_000, url: 'u/v0.6.0/dmg', sha256: 'c'.repeat(64) },
    ]);
    expect(data.beta?.files[0]?.sha256).toBeNull();
  });

  it('with a stable release newer than any beta, beta offers that release', async () => {
    const data = await latestReleases([release('v0.6.0-beta.2'), release('v0.6.0')], 'x/y', async () => null);
    expect(data.beta?.version).toBe('0.6.0');
  });

  it('says when there is no release yet', async () => {
    const data = await latestReleases([release('beta', { prerelease: true })], 'x/y', async () => null);
    expect(data).toEqual({ repo: 'x/y', stable: null, beta: null, installScript: null });
  });

  it('opens on stable, or on the beta while there is no stable release, and serves that install.sh', async () => {
    const both = await latestReleases([release('v0.6.0'), release('v0.7.0-beta.1')], 'x/y', async () => null);
    expect(firstChannel(both)).toBe('stable');
    expect(installScriptRelease(both)?.version).toBe('0.6.0');

    const betaOnly = await latestReleases([release('v0.6.0-beta.1')], 'x/y', async () => null);
    expect(firstChannel(betaOnly)).toBe('beta');
    expect(installScriptRelease(betaOnly)?.version).toBe('0.6.0-beta.1');

    const none = await latestReleases([], 'x/y', async () => null);
    expect(firstChannel(none)).toBeNull();
    expect(installScriptRelease(none)).toBeNull();

    expect(installCommand('stable')).toBe('curl -fsSL https://hlabs.h4loom.com/install.sh | sh');
    expect(installCommand('beta')).toBe('curl -fsSL https://hlabs.h4loom.com/install.sh | sh -s -- --channel beta');
  });
});
