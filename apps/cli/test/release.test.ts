// How a release is made (D-146), the parts that aren't files: the version and channel from a tag, which download serves
// which update platform, the update manifest (Tauri's format plus hlabsd's sha256, D-118), SHA256SUMS in the format
// install.sh reads, and the release's text, which says when something isn't signed.
import { describe, expect, it } from 'vitest';
import { checksums, fromTag, manifest, platformsOf, releaseText } from '../../../scripts/release-lib';

describe('release (D-146)', () => {
  it('reads the version and channel from the tag', () => {
    expect(fromTag('v1.2.3')).toEqual({ version: '1.2.3', channel: 'stable' });
    expect(fromTag('v1.3.0-beta.2')).toEqual({ version: '1.3.0-beta.2', channel: 'beta' });
    expect(() => fromTag('v1.2')).toThrow("isn't a version tag like v1.2.3");
    expect(() => fromTag('beta')).toThrow();
  });

  it('knows which update platform each download serves', () => {
    expect(platformsOf('hlabs-1.2.3-mac-arm64.app.tar.gz')).toEqual(['darwin-aarch64']);
    expect(platformsOf('hlabs-1.2.3-mac-x64.app.tar.gz')).toEqual(['darwin-x86_64']);
    expect(platformsOf('hlabs-1.2.3-linux-x86_64.AppImage')).toEqual(['linux-x86_64-appimage', 'linux-x86_64']);
    expect(platformsOf('hlabs-1.2.3-linux-aarch64.deb')).toEqual(['linux-aarch64-deb']);
    expect(platformsOf('hlabs-1.2.3-linux-x86_64.rpm')).toEqual(['linux-x86_64-rpm']);
    expect(platformsOf('hlabs-1.2.3-linux-aarch64.tar.gz')).toEqual(['hlabsd-linux-aarch64']);
    for (const none of ['hlabs-1.2.3-mac-arm64.dmg', 'install.sh', 'SHA256SUMS']) expect(platformsOf(none)).toEqual([]);
  });

  it('writes the manifest with every platform, and the sha256 only for hlabsd', () => {
    const base = 'https://github.com/haribrothers/hlabs/releases/download/v1.2.3';
    const m = manifest({
      version: '1.2.3',
      notes: '- Faster backups',
      base,
      pubDate: '2026-11-21T00:00:00.000Z',
      files: [
        { file: 'hlabs-1.2.3-mac-arm64.app.tar.gz', signature: 'sig-mac', sha256: 'a' },
        { file: 'hlabs-1.2.3-linux-x86_64.tar.gz', signature: 'sig-srv', sha256: 'b' },
        { file: 'hlabs-1.2.3-mac-arm64.dmg', signature: 'sig-dmg', sha256: 'c' },
      ],
    });
    expect(m).toEqual({
      version: '1.2.3',
      notes: '- Faster backups',
      pub_date: '2026-11-21T00:00:00.000Z',
      platforms: {
        'darwin-aarch64': { url: `${base}/hlabs-1.2.3-mac-arm64.app.tar.gz`, signature: 'sig-mac' },
        'hlabsd-linux-x86_64': { url: `${base}/hlabs-1.2.3-linux-x86_64.tar.gz`, signature: 'sig-srv', sha256: 'b' },
      },
    });
  });

  it('lists checksums sorted, as sha256sum writes them', () => {
    expect(
      checksums([
        { file: 'b.deb', sha256: '22' },
        { file: 'a.dmg', sha256: '11' },
      ]),
    ).toBe('11  a.dmg\n22  b.deb\n');
  });

  it('says in the release’s text what isn’t signed', () => {
    const unsigned = releaseText({ version: '1.2.3', notes: '- New', signed: false, macSigned: false });
    expect(unsigned).toContain('- New');
    expect(unsigned).toContain('**Not signed:**');
    expect(unsigned).toContain('Open Anyway');
    const signed = releaseText({ version: '1.2.3', notes: '- New', signed: true, macSigned: true });
    expect(signed).toContain('by the hlabs update key');
    expect(signed).not.toContain('Not signed');
    expect(signed).not.toContain('Open Anyway');
  });
});
