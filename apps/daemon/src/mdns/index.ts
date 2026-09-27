// mDNS names (hlabs.local, <app>.hlabs.local): dns-sd on macOS, Avahi on Linux (02 §2.6). Real publishers ship in phase 2.

export interface MdnsPublisher {
  publish(hostname: string): Promise<void>;
  unpublishAll(): Promise<void>;
}

export class NoopMdnsPublisher implements MdnsPublisher {
  async publish() {}
  async unpublishAll() {}
}
