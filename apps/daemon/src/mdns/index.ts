// mDNS names (hlabs.local, <app>.hlabs.local): dns-sd on macOS, Avahi on Linux (02 §2.6).

export interface MdnsPublisher {
  /** Publishes exactly these names (e.g. `hlabs.local`, `immich.hlabs.local`) and withdraws any others. */
  sync(names: string[]): Promise<void>;
  unpublishAll(): Promise<void>;
}

export class NoopMdnsPublisher implements MdnsPublisher {
  names: string[] = [];
  async sync(names: string[]) {
    this.names = [...names];
  }
  async unpublishAll() {
    this.names = [];
  }
}
