// mDNS names (hlabs.local, <app>.hlabs.local): dns-sd on macOS, Avahi on Linux (02 §2.6).

export interface MdnsPublisher {
  /** Publishes exactly these names (e.g. `hlabs.local`, `immich.hlabs.local`) and withdraws any others. */
  sync(names: string[]): Promise<void>;
  unpublishAll(): Promise<void>;
  /** False when the name can't be published (no publisher tool, no LAN address, or it keeps failing): the app is
   * then offered at its fallback address (US-APP-05). */
  isPublished(name: string): boolean;
}

/** Names are handled elsewhere (development without mDNS, tests): every name counts as published unless listed. */
export class NoopMdnsPublisher implements MdnsPublisher {
  names: string[] = [];
  readonly failing = new Set<string>();
  isPublished(name: string) {
    return !this.failing.has(name);
  }
  async sync(names: string[]) {
    this.names = [...names];
  }
  async unpublishAll() {
    this.names = [];
  }
}
