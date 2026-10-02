// A Tailscale for tests, and for development and e2e behind HLABS_DEV_FAKE_TAILSCALE (CI has no Tailscale).
import { TailscaleError, type ServeConfig, type TailscaleClient, type TailscaleState } from './types';

export class FakeTailscale implements TailscaleClient {
  current: TailscaleState = { kind: 'needs_login', authUrl: null };
  config: ServeConfig = {};
  etag = 1;
  /** The name a log-in gave this computer. */
  hostname: string | null = null;
  /** Writes refused as the Linux operator setting would (D-104). */
  denyWrites = false;
  /** Log-ins that complete straight away (e2e: the person finished in the other tab). */
  autoComplete: { tailnet: string; nodeName?: string } | null = null;
  logins = 0;
  /** The log-in page a log-in gives (e2e keeps it off the internet). */
  authUrl = 'https://login.tailscale.com/a/fake';

  async state() {
    return this.current;
  }

  async login({ hostname }: { hostname: string | null }) {
    if (this.denyWrites) throw new TailscaleError('permission', 'not the operator');
    this.logins++;
    if (hostname) this.hostname = hostname;
    this.current = { kind: 'needs_login', authUrl: this.authUrl };
    if (this.autoComplete) this.finishLogin(this.autoComplete.tailnet, this.autoComplete.nodeName);
  }

  /** The person finished logging in, in the other tab. */
  finishLogin(tailnet = 'tail1234.ts.net', nodeName = this.hostname ?? 'hlabs') {
    this.current = { kind: 'running', tailnet, nodeName, httpsEnabled: true, keyExpiry: null };
  }

  async serveConfig() {
    return { config: structuredClone(this.config), etag: String(this.etag) };
  }

  async setServeConfig(config: ServeConfig, etag: string) {
    if (this.denyWrites) throw new TailscaleError('permission', 'not the operator');
    if (etag !== String(this.etag)) throw new TailscaleError('conflict', 'changed meanwhile');
    this.config = structuredClone(config);
    this.etag++;
  }
}
