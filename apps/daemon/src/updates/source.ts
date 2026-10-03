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

export interface Release {
  version: string;
  /** The release notes (Markdown). */
  notes: string;
  /** The release page. */
  url: string;
}

export interface UpdateSource {
  /** The newest release on a channel; throws UPDATE_CHECK_FAILED when it can't be reached or read. */
  latest(channel: Channel): Promise<Release>;
}

/** The parts of a Tauri updater manifest hlabs reads (the platforms and signatures are the tray's, US-INST-19). */
const manifestSchema = z.object({ version: z.string().min(1), notes: z.string().optional() });

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
    return { version, notes: parsed.data.notes ?? '', url: releaseUrl(version) };
  }
}
