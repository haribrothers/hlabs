// What a release is made of (D-146), without touching files: the version and channel from a tag, which download is
// which platform's, the update manifest (`latest.json`, the Tauri updater's format plus hlabsd's entries, D-118) and
// the release's text.

export type Channel = 'stable' | 'beta';

/** `v1.2.3` → 1.2.3 on stable; `v1.2.3-beta.1` (any prerelease) → beta. Throws for anything that isn't a version. */
export function fromTag(tag: string): { version: string; channel: Channel } {
  const version = tag.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`"${tag}" isn't a version tag like v1.2.3`);
  return { version, channel: version.includes('-') ? 'beta' : 'stable' };
}

/** Where a download says it's for, from its name. */
export interface Download {
  file: string;
  /** Tauri's platform keys (`darwin-aarch64`, `linux-x86_64-deb`…) or hlabsd's (`hlabsd-linux-x86_64`). */
  platforms: string[];
}

const ARCH: Record<string, string> = { arm64: 'aarch64', x64: 'x86_64', aarch64: 'aarch64', x86_64: 'x86_64' };

/** The update platforms a release file serves; none for the disk images, checksums and the installer. */
export function platformsOf(file: string): string[] {
  let m = /^hlabs-.+-mac-(arm64|x64)\.app\.tar\.gz$/.exec(file);
  if (m) return [`darwin-${ARCH[m[1]!]}`];
  m = /^hlabs-.+-linux-(x86_64|aarch64)\.(deb|rpm|AppImage)$/.exec(file);
  if (m) {
    const base = `linux-${m[1]}`;
    const kind = m[2]!.toLowerCase();
    // An AppImage is also what a plain `linux-<arch>` key means to the Tauri updater.
    return kind === 'appimage' ? [`${base}-appimage`, base] : [`${base}-${kind}`];
  }
  m = /^hlabs-.+-linux-(x86_64|aarch64)\.tar\.gz$/.exec(file);
  if (m) return [`hlabsd-linux-${m[1]}`];
  return [];
}

export interface ManifestInput {
  version: string;
  notes: string;
  /** Where the release's files are: `https://github.com/<repo>/releases/download/v<version>`. */
  base: string;
  /** Each file with its signature (the `.sig`'s text) and SHA-256. */
  files: Array<{ file: string; signature: string; sha256: string }>;
  pubDate: string;
}

/** `latest.json`: the Tauri updater reads `url` and `signature`; hlabsd also checks `sha256` (D-118). */
export function manifest(input: ManifestInput) {
  const platforms: Record<string, { url: string; signature: string; sha256?: string }> = {};
  for (const { file, signature, sha256 } of input.files) {
    for (const platform of platformsOf(file)) {
      platforms[platform] = {
        url: `${input.base}/${file}`,
        signature,
        ...(platform.startsWith('hlabsd-') ? { sha256 } : {}),
      };
    }
  }
  return { version: input.version, notes: input.notes, pub_date: input.pubDate, platforms };
}

/** `SHA256SUMS`, sorted, in the `sha256sum` format install.sh reads. */
export function checksums(files: Array<{ file: string; sha256: string }>): string {
  return (
    [...files]
      .sort((a, b) => a.file.localeCompare(b.file))
      .map((f) => `${f.sha256}  ${f.file}`)
      .join('\n') + '\n'
  );
}

/** The release's text: the notes, then what's in it and what isn't signed yet. */
export function releaseText(input: { version: string; notes: string; signed: boolean; macSigned: boolean }): string {
  const lines = [input.notes.trim(), '', '---', ''];
  lines.push(
    'Install: download the `.dmg` for your Mac, the `.deb`, `.rpm` or AppImage for a Linux desktop, or on a Linux server run `curl -fsSL https://hlabs.h4loom.com/install.sh | sh`.',
  );
  lines.push('Every file is listed in `SHA256SUMS`.');
  if (input.signed) lines.push('Each file has a signature (`.sig`) by the hlabs update key.');
  else
    lines.push(
      '**Not signed:** this build has no signatures, so hlabs won’t update to it and install.sh won’t install it.',
    );
  if (!input.macSigned) {
    lines.push(
      '**The Mac builds aren’t signed by Apple yet:** macOS will ask before opening hlabs (System Settings › Privacy & Security › Open Anyway).',
    );
  }
  return lines.join('\n') + '\n';
}
