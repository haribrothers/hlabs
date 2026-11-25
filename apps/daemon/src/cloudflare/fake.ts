// A Cloudflare for tests, and for development and e2e behind HLABS_DEV_FAKE_CLOUDFLARE: no network, ever. Its zone is
// `example.com` with a website and email already in its DNS (`example.com`, `www`, `mail`), so a name like `www` is
// taken; sign-ins wait for `finishSignIn()` unless `autoApprove` is set (e2e, through `POST /dev/cloudflare`); a test
// makes a step fail with `failing`.
import { randomBytes } from 'node:crypto';
import {
  CloudflareError,
  type CloudflareClient,
  type CloudflareCredential,
  type CloudflareSignIn,
  type CloudflareStep,
  type ConnectorOrigin,
  type ConnectorState,
  type TunnelConnector,
} from './types';

/** The token the fake accepts (any other is refused as Cloudflare would). Not a secret. */
export const FAKE_CLOUDFLARE_TOKEN = 'fake-cloudflare-token-0123456789';

export interface FakeRecord {
  id: string;
  name: string;
  /** `<tunnelId>.cfargotunnel.com` for hlabs's, anything for the zone's own. */
  content: string;
  /** Made by hlabs (through addRecord), not the zone's own. */
  byHlabs: boolean;
}

export class FakeCloudflare implements CloudflareClient, TunnelConnector {
  /** The zone the sign-in picks, and the one tokens cover. */
  domain = 'example.com';
  /** Sign-ins are approved this long after they start (e2e: the person approves in the other tab); null waits. */
  autoApprove: number | null = null;
  /** Cloudflare's sign-in link the fake gives (e2e: never a real Cloudflare page). */
  signInUrl = 'about:blank#cloudflare-sign-in';
  /**
   * In development the link is the pretend Cloudflare's own page (`/dev/cloudflare/sign-in`, served by the daemon and
   * reached through the dashboard's address), where Approve finishes the sign-in; tests keep the blank page.
   */
  static readonly DEV_SIGN_IN_PATH = '/dev/cloudflare/sign-in';
  /** Steps that fail, as Cloudflare would refuse or not answer. */
  failing = new Set<CloudflareStep>();
  /** The zone's DNS, with records hlabs didn't make (a website, email). */
  records = new Map<string, FakeRecord>();
  tunnels = new Map<string, string>();
  /** Every call, for tests: `signIn`, `checkToken`, `createTunnel:<name>`, `addRecord:<name>`… */
  calls: string[] = [];
  private connector: ConnectorState = 'stopped';
  /** What the connector was started with. */
  started: { tunnelId: string; credentialsFile: string; origin: string } | null = null;
  private pending: { resolve: (c: CloudflareCredential) => void; reject: (e: Error) => void } | null = null;
  private autoTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.reset();
  }

  /** Back to a fresh zone and nothing set up (e2e, between specs). */
  reset(): void {
    this.records = new Map();
    for (const name of [this.domain, `www.${this.domain}`, `mail.${this.domain}`]) {
      const id = randomBytes(8).toString('hex');
      this.records.set(id, { id, name, content: '192.0.2.10', byHlabs: false });
    }
    this.tunnels = new Map();
    this.failing = new Set();
    this.calls = [];
    this.connector = 'stopped';
    this.started = null;
    this.cancelPending(new CloudflareError('signIn', 'reset'));
  }

  private check(step: CloudflareStep) {
    if (this.failing.has(step)) throw new CloudflareError(step, `fake Cloudflare fails at ${step}`);
  }

  private credential(kind: CloudflareCredential['kind'], token: string): CloudflareCredential {
    return { kind, token, zoneId: `zone-${this.domain}`, accountId: 'account-fake', domain: this.domain };
  }

  async signIn(): Promise<CloudflareSignIn> {
    this.calls.push('signIn');
    this.check('signIn');
    this.cancelPending(new CloudflareError('signIn', 'replaced'));
    const done = new Promise<CloudflareCredential>((resolve, reject) => (this.pending = { resolve, reject }));
    // Nobody may be waiting yet: a rejection is the caller's to handle when it does.
    done.catch(() => {});
    if (this.autoApprove !== null) {
      this.autoTimer = setTimeout(() => this.finishSignIn(), this.autoApprove);
      this.autoTimer.unref();
    }
    return { url: this.signInUrl, done, cancel: () => this.cancelPending(new CloudflareError('signIn', 'cancelled')) };
  }

  /** The admin approved hlabs for the domain in Cloudflare's tab. */
  finishSignIn(): void {
    const p = this.pending;
    this.pending = null;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    if (!p) return;
    if (this.failing.has('signIn')) p.reject(new CloudflareError('signIn', 'fake Cloudflare refused the sign-in'));
    else p.resolve(this.credential('signIn', `fake-cert-token-${randomBytes(8).toString('hex')}`));
  }

  /** The sign-in under way is waiting for the admin. */
  get signingIn(): boolean {
    return this.pending !== null;
  }

  private cancelPending(err: Error) {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
  }

  async checkToken(token: string, domain: string): Promise<CloudflareCredential> {
    this.calls.push('checkToken');
    this.check('token');
    if (token !== FAKE_CLOUDFLARE_TOKEN) throw new CloudflareError('token', 'Invalid API token');
    this.check('zone');
    if (domain !== this.domain) throw new CloudflareError('zone', `No zone ${domain}`);
    return this.credential('token', token);
  }

  async createTunnel(_cred: CloudflareCredential, name: string) {
    this.calls.push(`createTunnel:${name}`);
    this.check('tunnel');
    const tunnelId = `${randomBytes(4).toString('hex')}-fake-tunnel`;
    this.tunnels.set(tunnelId, name);
    return {
      tunnelId,
      credentials: { AccountTag: 'account-fake', TunnelSecret: randomBytes(32).toString('base64'), TunnelID: tunnelId },
    };
  }

  async deleteTunnel(_cred: CloudflareCredential, tunnelId: string) {
    this.calls.push(`deleteTunnel:${tunnelId}`);
    this.check('remove');
    this.tunnels.delete(tunnelId);
  }

  async nameTaken(_cred: CloudflareCredential, name: string) {
    this.calls.push(`nameTaken:${name}`);
    this.check('dns');
    return [...this.records.values()].some((r) => r.name === name);
  }

  async addRecord(_cred: CloudflareCredential, name: string, tunnelId: string) {
    this.calls.push(`addRecord:${name}`);
    this.check('dns');
    if ([...this.records.values()].some((r) => r.name === name))
      throw new CloudflareError('dns', `${name} exists`, true);
    const id = randomBytes(8).toString('hex');
    this.records.set(id, { id, name, content: `${tunnelId}.cfargotunnel.com`, byHlabs: true });
    return { id };
  }

  async deleteRecord(_cred: CloudflareCredential, recordId: string) {
    const name = this.records.get(recordId)?.name ?? recordId;
    this.calls.push(`deleteRecord:${name}`);
    this.check('dns');
    this.records.delete(recordId);
  }

  /** The records hlabs made, by name (tests). */
  hlabsRecords(): string[] {
    return [...this.records.values()].filter((r) => r.byHlabs).map((r) => r.name);
  }

  async start(opts: ConnectorOrigin) {
    this.calls.push('connector:start');
    this.started = opts;
    this.connector = this.failing.has('connector') ? 'failed' : 'running';
  }

  async stop() {
    if (this.connector !== 'stopped') this.calls.push('connector:stop');
    this.connector = 'stopped';
    this.started = null;
  }

  state(): ConnectorState {
    return this.connector;
  }
}
