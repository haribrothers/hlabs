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
  /**
   * An API token with "Account · Access: Apps and Policies · Edit" and "Account · Access: Organizations, Identity Providers, and Groups · Edit" (US-SYS-48), given when `token` can't manage
   * Cloudflare Access; used for Access calls only.
   */
  accessToken?: string;
}

/** Where a Cloudflare step failed, for `CLOUDFLARE_FAILED { step }`. */
export type CloudflareStep = 'signIn' | 'token' | 'zone' | 'tunnel' | 'dns' | 'connector' | 'remove' | 'access';

export class CloudflareError extends Error {
  override readonly name = 'CloudflareError';
  constructor(
    readonly step: CloudflareStep,
    message: string,
    /** Cloudflare said the thing is already there (a tunnel's name, a DNS record). */
    readonly conflict = false,
    /** Cloudflare refused the credential for this (401, 403): for Access, a token with that permission is needed. */
    readonly denied = false,
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
  /**
   * Whether the credential (its `accessToken` when there is one) can manage Cloudflare Access for the account
   * (US-SYS-48): resolves when it can; a CloudflareError at `access` with `denied` when Cloudflare refuses it.
   */
  checkAccess(cred: CloudflareCredential): Promise<void>;
  /**
   * An Access application for `hostname` (self-hosted, Cloudflare's one-time code by email) with a policy allowing
   * `emails`; the only Access applications hlabs ever changes or deletes.
   */
  createAccessApp(cred: CloudflareCredential, opts: { hostname: string; emails: string[] }): Promise<AccessApp>;
  /** The allow list of an Access application hlabs made. */
  updateAccessPolicy(cred: CloudflareCredential, app: AccessApp, emails: string[]): Promise<void>;
  /** Deletes an Access application hlabs made; one that's already gone is fine. */
  deleteAccessApp(cred: CloudflareCredential, appId: string): Promise<void>;
}

/** An Access application hlabs made, and its policy. */
export interface AccessApp {
  appId: string;
  policyId: string;
}

export type ConnectorState = 'stopped' | 'starting' | 'running' | 'failed';

/** The cloudflared connector, run by the daemon like Caddy (one for every public name). */
export interface ConnectorOrigin {
  tunnelId: string;
  credentialsFile: string;
  /** Caddy's public listener: `https://127.0.0.1:<port>`. */
  origin: string;
  /** The name on the listener's certificate (D-181), asked for when connecting. */
  originServerName: string;
  /** hlabs's local CA certificate: the only one cloudflared trusts for the listener. */
  caPool: string;
}

export interface TunnelConnector {
  /** Runs it for the tunnel, sending every name to `origin` over TLS (D-181); started again if it stops. */
  start(opts: ConnectorOrigin): Promise<void>;
  stop(): Promise<void>;
  state(): ConnectorState;
}
