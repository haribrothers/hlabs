// "Use hlabs as an app" in Settings › Account (US-INST-28, D-126): how to install hlabs on this computer, per browser —
// Chrome and Edge get an Install button once they offer it, Safari says File › Add to Dock, other browsers which to use.
// While remote access is on and this page isn't on the tailnet address, a second row suggests installing from there:
// an installed app keeps the address it was installed from. Hidden in the installed app itself and on phones.
import { ExternalLink, iconDefaults, AppWindow, Download } from '@hlabs/icons';
import { helpUrl } from '@hlabs/shared';
import { Button, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { browser } from '../lib/browser';
import { promptInstall, useInstall } from '../lib/install-app';
import { useTRPC } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';

const copy = accountCopy;
/** The help page that says how, per browser. */
export const INSTALL_HELP = 'get-started/use-as-app';

/** The hlabs app icon, as installed. */
function AppIcon() {
  return <img src="/icons/icon-192.png" alt="" width={44} height={44} className="shrink-0 rounded-[12px]" />;
}

export function ThisComputer() {
  const trpc = useTRPC();
  const desktop = useIsDesktop();
  const install = useInstall();
  const account = useQuery({ ...trpc.account.get.queryOptions(), retry: false });
  const [busy, setBusy] = useState(false);
  if (!desktop || install.standalone) return null;

  const tailnet = account.data?.tailnetUrl ?? null;
  const onTailnet = tailnet !== null && new URL(tailnet).host === window.location.host;
  let subtitle: React.ReactNode = copy.useAsAppIntro;
  let trailing: React.ReactNode = null;
  if (install.installed) {
    subtitle = <span className="text-success">{copy.installedApp}</span>;
  } else if (install.browser === 'chromium' && install.canPrompt) {
    trailing = (
      <Button
        variant="secondary"
        size="sm"
        busy={busy}
        onClick={() => {
          setBusy(true);
          void promptInstall().finally(() => setBusy(false));
        }}
      >
        <Download aria-hidden {...iconDefaults} className="size-4" />
        {copy.installApp}
      </Button>
    );
  } else if (install.browser === 'safari') {
    subtitle = (
      <>
        {copy.useAsAppIntro}
        <br />
        <span className="text-ink">{copy.safariHow}</span>
      </>
    );
  } else {
    subtitle = (
      <>
        {copy.useAsAppIntro}
        <br />
        <span className="text-ink">{copy.otherBrowser}</span>
      </>
    );
    trailing = (
      <Button variant="secondary" size="sm" href={helpUrl(INSTALL_HELP)} target="_blank" rel="noreferrer">
        {copy.howToInstall}
      </Button>
    );
  }
  return (
    <List label={copy.thisComputer}>
      <ListRow leading={<AppIcon />} title={copy.useAsApp} subtitle={subtitle} trailing={trailing} />
      {tailnet && !onTailnet && !install.installed ? (
        <ListRow
          leading={
            <span className="flex w-11 shrink-0 justify-center text-accent-link">
              <AppWindow aria-hidden {...iconDefaults} />
            </span>
          }
          title={copy.tailnetHint}
          subtitle={<span className="font-mono">{tailnet}</span>}
          trailing={
            <Button variant="secondary" size="sm" onClick={() => browser.open(tailnet)}>
              <ExternalLink aria-hidden {...iconDefaults} className="size-4" />
              {copy.openTailnet}
            </Button>
          }
        />
      ) : null}
    </List>
  );
}
