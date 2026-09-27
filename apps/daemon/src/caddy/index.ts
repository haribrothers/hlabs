// Caddy is managed through its admin API (D-006). Phase 0 ships the interface; phase 2 the real client.

export interface ProxyManager {
  /** Start Caddy with the base config (dashboard route, local CA). */
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class NoopProxyManager implements ProxyManager {
  async start() {}
  async stop() {}
}
