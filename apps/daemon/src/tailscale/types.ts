// Tailscale, used through its LocalAPI (D-007, D-102…D-104). Tailscale isn't bundled: hlabs talks to the one
// installed on this computer. Behind this interface so tests and e2e use a fake.

export type TailscaleState =
  /** No Tailscale on this computer. */
  | { kind: 'not_installed' }
  /** Installed, but its service isn't running (or the app isn't open). */
  | { kind: 'stopped' }
  /** Running but signed out; `authUrl` once a log-in has been started. */
  | { kind: 'needs_login'; authUrl: string | null }
  | {
      kind: 'running';
      /** The tailnet's DNS suffix: `tail1234.ts.net`. */
      tailnet: string;
      /** This computer's name on it: `hari-home` (from `Self.DNSName`, not the display name). */
      nodeName: string;
      /** HTTPS certificates are enabled for the tailnet (`CertDomains`). */
      httpsEnabled: boolean;
      /** When this computer's key expires (ms), or null when it doesn't. */
      keyExpiry: number | null;
    };

/** Tailscale Serve's config (ipn.ServeConfig): only the parts hlabs reads or writes; the rest is kept as it is. */
export interface ServeConfig {
  TCP?: Record<string, { HTTPS?: boolean; HTTP?: boolean; TCPForward?: string } | undefined>;
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string; Path?: string; Text?: string }> } | undefined>;
  AllowFunnel?: Record<string, boolean>;
  [key: string]: unknown;
}

export type TailscaleErrorKind = 'permission' | 'conflict' | 'unavailable';

/** A LocalAPI call that failed: not allowed (Linux operator, D-104), changed meanwhile (stale ETag), or unreachable. */
export class TailscaleError extends Error {
  constructor(
    readonly kind: TailscaleErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface TailscaleClient {
  state(): Promise<TailscaleState>;
  /** Starts an interactive log-in; names the computer `hostname` first when given (hlabs's first log-in, D-102). */
  login(opts: { hostname: string | null }): Promise<void>;
  serveConfig(): Promise<{ config: ServeConfig; etag: string }>;
  /** Writes the whole config if it hasn't changed since `etag` was read. */
  setServeConfig(config: ServeConfig, etag: string): Promise<void>;
}
