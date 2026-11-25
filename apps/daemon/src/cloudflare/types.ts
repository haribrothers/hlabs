// Cloudflare Tunnel for public apps (US-SYS-43, D-171, D-178): signing in to Cloudflare, the zone's DNS records hlabs
// makes, the tunnel, and the `cloudflared` connector that carries every public name to Caddy's public listener. Behind
// these interfaces so tests, development and e2e use a fake (HLABS_DEV_FAKE_CLOUDFLARE) and never reach Cloudflare.

/** What hlabs keeps in the keychain as `cloudflare-credential` (07 §7.7): never in SQLite or logs. */
export interface CloudflareCredential {
  /** "Sign in to Cloudflare" (the zone-scoped token in cloudflared's origin certificate), or an API token. */
  kind: 'signIn' | 'token';
  token: string;
  zoneId: string;
  accountId: string;
  /** The zone's name: `example.com`. */
  domain: string;
}

/** Where a Cloudflare step failed, for `CLOUDFLARE_FAILED { step }`. */
export type CloudflareStep = 'signIn' | 'token' | 'zone' | 'tunnel' | 'dns' | 'connector' | 'remove';

export class CloudflareError extends Error {
  override readonly name = 'CloudflareError';
  constructor(
    readonly step: CloudflareStep,
    message: string,
    /** Cloudflare said the thing is already there (a tunnel's name, a DNS record). */
    readonly conflict = false,
  ) {
    super(message);
  }
}

/** A sign-in under way: the link to open, and the credential once the admin approves a domain there. */
export interface CloudflareSignIn {
  url: string;
  done: Promise<CloudflareCredential>;
  cancel(): void;
}

/** The tunnel's credentials file (`<dataDir>/cloudflare/tunnel.json`, 0600), as cloudflared reads it. */
export interface TunnelCredentials {
  AccountTag: string;
  TunnelSecret: string;
  TunnelID: string;
}

export interface CloudflareClient {
  /** Starts Cloudflare's sign-in (`cloudflared tunnel login`); resolves once its link is known. */
  signIn(): Promise<CloudflareSignIn>;
  /** Checks an API token covers `domain` (Zone · DNS · Edit and Account · Cloudflare Tunnel · Edit). */
  checkToken(token: string, domain: string): Promise<CloudflareCredential>;
  createTunnel(cred: CloudflareCredential, name: string): Promise<{ tunnelId: string; credentials: TunnelCredentials }>;
  /** Deletes the tunnel; one that's already gone is fine. */
  deleteTunnel(cred: CloudflareCredential, tunnelId: string): Promise<void>;
  /** Whether the zone's DNS has a record named `name` (`photos.example.com`) already. */
  nameTaken(cred: CloudflareCredential, name: string): Promise<boolean>;
  /** A proxied CNAME from `name` to the tunnel; its record id, the only kind of record hlabs ever deletes. */
  addRecord(cred: CloudflareCredential, name: string, tunnelId: string): Promise<{ id: string }>;
  /** Deletes a record hlabs made; one that's already gone is fine. */
  deleteRecord(cred: CloudflareCredential, recordId: string): Promise<void>;
}

export type ConnectorState = 'stopped' | 'starting' | 'running' | 'failed';

/** The cloudflared connector, run by the daemon like Caddy (one for every public name). */
export interface TunnelConnector {
  /** Runs it for the tunnel, sending every name to `origin` (`http://127.0.0.1:<public port>`); started again if it stops. */
  start(opts: { tunnelId: string; credentialsFile: string; origin: string }): Promise<void>;
  stop(): Promise<void>;
  state(): ConnectorState;
}
