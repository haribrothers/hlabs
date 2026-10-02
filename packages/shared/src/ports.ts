/**
 * An app's tailnet port sits this far above its own port (D-110): 12000–12999 at home, 14000–14999 on the tailnet.
 * On macOS, Tailscale Serve listens on the tailnet addresses of every port it serves, and Caddy can't then listen on
 * the same port on every address, so the two never share one.
 */
export const TAILNET_PORT_OFFSET = 2000;

/** The port an app has on the tailnet, from its own port. */
export const tailnetAppPort = (appPort: number) => appPort + TAILNET_PORT_OFFSET;
