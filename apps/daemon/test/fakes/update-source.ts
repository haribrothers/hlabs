import { hlabsError } from '@hlabs/api';
import { releaseUrl, type Channel, type Release, type UpdateSource } from '../../src/updates/source';

/** The update manifest per channel; offline throws as the real source does (UPDATE_CHECK_FAILED). */
export class FakeUpdateSource implements UpdateSource {
  releases: Record<Channel, { version: string; notes?: string }> = {
    stable: { version: '0.0.0' },
    beta: { version: '0.0.0' },
  };
  offline = false;
  calls: Channel[] = [];
  async latest(channel: Channel): Promise<Release> {
    this.calls.push(channel);
    if (this.offline) throw hlabsError('UPDATE_CHECK_FAILED', 'fetch failed');
    const { version, notes = '' } = this.releases[channel];
    return { version, notes, url: releaseUrl(version) };
  }
}
