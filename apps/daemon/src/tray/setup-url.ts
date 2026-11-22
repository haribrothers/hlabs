// tray.setupUrl (US-INST-02, US-INST-24, D-013, D-035): the setup URL with its one-time token for this computer, and,
// with Caddy, the same at each LAN address and at the `.local` name while it's published, on the HTTP port Caddy
// serves the dashboard on until onboarding is done (D-140). `hlabs setup-url` prints them; the Mac tray opens `url`.
import type { DaemonConfig } from '../config';
import type { NetworkService } from '../network/service';
import type { OnboardingService } from '../onboarding/service';

export interface SetupUrlDeps {
  config: Pick<DaemonConfig, 'proxy'>;
  onboarding: Pick<OnboardingService, 'setupUrl' | 'lanSetupUrls'>;
  routing: Pick<NetworkService, 'homeNetwork'>;
}

export async function setupUrls(deps: SetupUrlDeps) {
  const url = await deps.onboarding.setupUrl();
  if (!url || deps.config.proxy !== 'caddy') return { url, lanUrls: [], mdnsUrl: null };
  const home = deps.routing.homeNetwork();
  const [mdnsUrl] = home.published ? await deps.onboarding.lanSetupUrls([new URL(home.localAddress).hostname]) : [];
  return { url, lanUrls: await deps.onboarding.lanSetupUrls(home.lanAddresses), mdnsUrl: mdnsUrl ?? null };
}
