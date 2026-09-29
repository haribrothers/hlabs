// OnbDone (US-ONB-21): what was set up. Laid out like the welcome screen, with no Stepper. The remote access and
// installing-apps rows wait for phases 3 and 2 (D-036). "Open dashboard" goes Home (US-ONB-22).
import { ArrowRight, Check, iconDefaults } from '@hlabs/icons';
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

export function DoneStep() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  // Always fresh: the summary must match what was just set up.
  const me = useQuery({ ...trpc.auth.me.queryOptions(), retry: false, staleTime: 0 });
  const info = useQuery({ ...trpc.system.info.queryOptions(), retry: false });
  const locations = useQuery({ ...trpc.storage.locations.list.queryOptions(), retry: false, staleTime: 0 });
  const root = locations.data?.locations.find((l) => l.isRoot);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  // Starter apps arrive with phase 2 (US-ONB-19); until then none are picked and there is no Installing row.
  const appsPicked = false;

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
