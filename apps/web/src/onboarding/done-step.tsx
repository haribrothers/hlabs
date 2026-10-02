// OnbDone (US-ONB-21): what was set up. Laid out like the welcome screen, with no Stepper. "Installing N apps" lists
// the starter apps picked (US-ONB-19; none after Skip, US-ONB-20); remote access says "Home network only" after Set up
// later (US-ONB-18).
// "Open dashboard" goes Home (US-ONB-22).
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { ArrowRight, Check, iconDefaults, Loader2 } from '@hlabs/icons';
import { Button, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { useTRPC } from '../lib/trpc';

const copy = onboardingCopy.done;

export const firstName = (displayName: string | undefined) => displayName?.trim().split(/\s+/)[0] ?? '';

/** "Your apps are installing." only when starter apps were picked; the menu bar isn't there on a server. */
export function doneLead(opts: { appsPicked: boolean; headless: boolean }) {
  const rest = opts.headless ? copy.background : copy.menuBar;
  return opts.appsPicked ? `${copy.appsInstalling} ${rest}` : rest;
}

function Done() {
  return (
    <span className="grid size-20 place-items-center rounded-pill border border-success/40 bg-surface-row text-success">
      <Check aria-hidden {...iconDefaults} className="size-9" />
    </span>
  );
}

export function DoneStep({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  // Always fresh: the summary must match what was just set up.
  const me = useQuery({ ...trpc.auth.me.queryOptions(), retry: false, staleTime: 0 });
  const info = useQuery({ ...trpc.system.info.queryOptions(), retry: false });
  const locations = useQuery({ ...trpc.storage.locations.list.queryOptions(), retry: false, staleTime: 0 });
  const root = locations.data?.locations.find((l) => l.isRoot);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  // The starter apps picked: on a new hlabs they're the only apps there are (phase 2, US-ONB-19).
  const starterApps = isFeatureEnabled('starterApps', shippedPhase);
  const installed = useQuery({ ...trpc.apps.list.queryOptions(), enabled: starterApps, retry: false, staleTime: 0 });
  const picked = installed.data?.apps ?? [];
  const appsPicked = picked.length > 0;

  const row = (title: string, value: string | undefined) => (
    <ListRow
      title={title}
      leading={<Check aria-hidden {...iconDefaults} className="size-4 text-success" />}
      trailing={<span className="text-body-sm text-ink-muted">{value ?? '…'}</span>}
    />
  );

  return (
    <>
      <Done />
      <h1 ref={heading} tabIndex={-1} className="m-0 mt-4 text-display outline-none">
        {copy.title(firstName(me.data?.displayName))}
      </h1>
      <p className="m-0 text-body text-ink-muted">
        {doneLead({ appsPicked, headless: info.data?.os.headless ?? false })}
      </p>
      <div className="mt-4 w-full max-w-md text-left">
        <List label={<span className="sr-only">{copy.summary}</span>}>
          {row(copy.admin, me.data ? copy.adminDetail(me.data.username, me.data.totpEnabled) : undefined)}
          {row(copy.storage, root?.name)}
          {isFeatureEnabled('remoteAccess', shippedPhase) ? row(copy.remote, copy.homeNetworkOnly) : null}
          {appsPicked ? (
            <ListRow
              title={copy.installing(picked.length)}
              leading={
                <Loader2
                  aria-hidden
                  {...iconDefaults}
                  className="size-4 animate-spin text-warning motion-reduce:animate-none"
                />
              }
              trailing={<span className="text-body-sm text-ink-muted">{picked.map((a) => a.name).join(', ')}</span>}
            />
          ) : null}
        </List>
      </div>
      {/* Onboarding is complete by now; Home opens with the admin still signed in (US-ONB-22). */}
      <Button size="lg" className="mt-4" onClick={() => void navigate({ to: '/' })}>
        {copy.openDashboard}
        <ArrowRight aria-hidden {...iconDefaults} />
      </Button>
    </>
  );
}
