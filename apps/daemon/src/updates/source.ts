// Where hlabs learns about new versions (US-SYS-24, 02 §2.10): the Tauri updater's `latest.json` on GitHub Releases,
// one per channel (D-117). The only outbound call this makes is that manifest (07 §7.1). HLABS_UPDATE_ENDPOINT points
// it somewhere else (a local server for the signed test update, phase 4); `{channel}` in it is replaced.
import { hlabsError } from '@hlabs/api';
import { z } from 'zod';

export const RELEASES = 'https://github.com/haribrothers/hlabs/releases';
const MANIFEST: Record<Channel, string> = {
  stable: `${RELEASES}/latest/download/latest.json`,
  beta: `${RELEASES}/download/beta/latest.json`,
};
const TIMEOUT_MS = 15_000;

export type Channel = 'stable' | 'beta';

/** One platform's download in the manifest: the Tauri updater's `url` and `signature`, plus `sha256` for hlabsd. */
export interface PlatformDownload {
  url: string;
  /** base64 minisign signature (Tauri updater format). */
  signature: string;
  sha256?: string;
}

export interface Release {
  version: string;
  /** By platform: Tauri's (`darwin-aarch64`, `linux-x86_64`…) and headless hlabsd's (`hlabsd-linux-x86_64`…, D-118). */
  platforms: Record<string, PlatformDownload>;
  /** The release notes (Markdown). */
  notes: string;
  /** The release page. */
  url: string;
}

export interface UpdateSource {
  /** The newest release on a channel; throws UPDATE_CHECK_FAILED when it can't be reached or read. */
  latest(channel: Channel): Promise<Release>;
}

/** The parts of a Tauri updater manifest hlabs reads. */
const manifestSchema = z.object({
  version: z.string().min(1),
  notes: z.string().optional(),
  platforms: z
    .record(z.string(), z.object({ url: z.string().url(), signature: z.string(), sha256: z.string().optional() }))
    .default({}),
});

export function releaseUrl(version: string): string {
  return `${RELEASES}/tag/v${version.replace(/^v/, '')}`;
}

/** Up to five bullet points from release notes ("- …" or "* …" lines). */
export function noteBullets(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => !!line)
    .slice(0, 5);
}

export class HttpUpdateSource implements UpdateSource {
  constructor(private readonly endpoint: string | undefined = process.env.HLABS_UPDATE_ENDPOINT) {}

  async latest(channel: Channel): Promise<Release> {
    const url = this.endpoint ? this.endpoint.replace('{channel}', channel) : MANIFEST[channel];
    let body: unknown;
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err) {
      throw hlabsError('UPDATE_CHECK_FAILED', (err as Error).message);
    }
    const parsed = manifestSchema.safeParse(body);
    if (!parsed.success) throw hlabsError('UPDATE_CHECK_FAILED', 'unreadable update manifest');
    const version = parsed.data.version.replace(/^v/, '');
    return { version, notes: parsed.data.notes ?? '', url: releaseUrl(version), platforms: parsed.data.platforms };
  }
}
