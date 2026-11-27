// "At home only" (US-SYS-47; D-182, 07 §7.11 control 5): on the public dashboard (`auth.me.via === 'public'`) every
// control for a home-only change is shown, not hidden, with a house and "At home only", and choosing it explains why
// ("Do this at home or on your tailnet") instead of acting. The list is the daemon's (`HOME_ONLY_PROCEDURES` in
// @hlabs/shared), which refuses those calls there anyway with HOME_ONLY: that answer opens the same explanation.
// Stopping exposure (making things private, turning off all public access, signing out everywhere) is never home-only.
import { Globe, House, iconDefaults } from '@hlabs/icons';
import { isHomeOnly, type HomeOnlyProcedure, type Via } from '@hlabs/shared';
import { Button, cn, HomeOnlyButton, HomeOnlyPill, ModalDialog, useIsPhone } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { cloneElement, isValidElement, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import {
  closeAway,
  closeHomeOnly,
  currentAway,
  currentHomeOnly,
  explainHomeOnly,
  subscribeAway,
  subscribeHomeOnly,
} from './explain';
import { publicDashboardCopy as copy } from '../copy/public-dashboard';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';

/** Where this dashboard is used from, once signed in (`auth.me.via`); undefined until known. */
export function useVia(): Via | undefined {
  return useMe().data?.via;
}

/** hlabs is used from the internet, through the public dashboard. */
export function useOnPublic(): boolean {
  return useVia() === 'public';
}

/**
 * Where the log-in screen, an invite or a reset link was opened from, before anyone signs in (`auth.listLoginUsers`
 * says, D-185); undefined until it answers.
 */
export function useSignedOutVia(): Via | undefined {
  const trpc = useTRPC();
  return useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false, staleTime: 60_000 }).data?.via;
}

/** Whether a control calling `procedure` (with `input`) shows "At home only" here. */
export function useHomeOnly(procedure: HomeOnlyProcedure, input?: unknown): boolean {
  const onPublic = useOnPublic();
  return onPublic && isHomeOnly(procedure, input);
}

// ── The explanation ─────────────────────────────────────────────────────────────────────────────────────────────

/** HomeOnlyAction's dialog: a house, the title, why, and OK. */
export function HomeOnlyHost() {
  const current = useSyncExternalStore(subscribeHomeOnly, currentHomeOnly);
  return (
    <ModalDialog
      open={current !== null}
      onOpenChange={(open) => (open ? null : closeHomeOnly())}
      role="alertdialog"
      icon={
        <span className="grid size-12 place-items-center rounded-md bg-surface-control text-ink">
          <House aria-hidden {...iconDefaults} />
        </span>
      }
      title={copy.homeOnlyTitle}
      description={copy.homeOnlyBody(current?.what ?? null)}
      actions={<Button onClick={() => closeHomeOnly()}>{copy.ok}</Button>}
      width={440}
    />
  );
}

/**
 * "<App> opens at home or on your tailnet." for an app that isn't public, chosen on the public address from the Dock,
 * search or a phone's Home (HomePublicAddress; Home on a computer shows it as a popover under the tile). Admins also
 * see "Make <App> public…", itself at home only.
 */
export function AwayHost() {
  const app = useSyncExternalStore(subscribeAway, currentAway);
  const isAdmin = useMe(app !== null).data?.role === 'admin';
  return (
    <ModalDialog
      open={app !== null}
      onOpenChange={(open) => (open ? null : closeAway())}
      icon={
        <span className="grid size-12 place-items-center rounded-md bg-surface-control text-ink">
          <House aria-hidden {...iconDefaults} />
        </span>
      }
      title={app ? copy.opensAtHome(app.name) : ''}
      description={copy.notPublicNote}
      actions={<Button onClick={closeAway}>{copy.ok}</Button>}
      width={440}
    >
      {app && isAdmin ? <MakePublicAway name={app.name} onChoose={closeAway} /> : null}
    </ModalDialog>
  );
}

/** "Make <App> public…" with "At home only": explains, since making an app public only works at home. */
export function MakePublicAway({ name, onChoose }: { name: string; onChoose?: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={copy.atHomeOnlyLabel(copy.makeAppPublic(name))}
      onClick={() => {
        onChoose?.();
        explainHomeOnly('apps.setPublic');
      }}
      className="hl-focus flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border-0 bg-surface-row px-3 text-left text-body-sm font-semibold text-ink hover:bg-surface-control"
    >
      <Globe aria-hidden {...iconDefaults} size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{copy.makeAppPublic(name)}</span>
      <HomeOnlyPill label={copy.atHomeOnly} />
    </button>
  );
}

// ── The controls ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A button for a home-only change: as it is at home; on the public address the same label dimmed, with "At home
 * only" inside, explaining instead of acting. `label` is the button's visible words ("Remove…").
 */
export function HomeOnly({
  procedure,
  input,
  label,
  name,
  size = 'sm',
  className,
  children,
}: {
  procedure: HomeOnlyProcedure;
  input?: unknown;
  label: string;
  /** The accessible name when the label alone is too short ("Change" → "Change the DNS server"). */
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}) {
  const away = useHomeOnly(procedure, input);
  if (!away) return <>{children}</>;
  return (
    <HomeOnlyButton
      pill={copy.atHomeOnly}
      size={size}
      className={className}
      aria-label={copy.atHomeOnlyLabel(name ?? label)}
      onClick={() => explainHomeOnly(procedure)}
    >
      {label}
    </HomeOnlyButton>
  );
}

/**
 * A switch or field for a home-only change: on the public address the control is turned off (`disabled`) and "At home
 * only" beside it explains why when chosen. `label` names the control for the pill's accessible name.
 */
export function HomeOnlyControl({
  procedure,
  label,
  children,
}: {
  procedure: HomeOnlyProcedure;
  label: string;
  children: ReactElement<{ disabled?: boolean }>;
}) {
  const away = useHomeOnly(procedure);
  if (!away || !isValidElement(children)) return children;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {cloneElement(children, { disabled: true })}
      <HomeOnlyPillButton procedure={procedure} label={label} />
    </span>
  );
}

/** The pill alone as a control: beside a row's switch, or a menu entry's end. */
export function HomeOnlyPillButton({ procedure, label }: { procedure: HomeOnlyProcedure; label: string }) {
  return (
    <HomeOnlyButton
      pill={copy.atHomeOnly}
      aria-label={copy.atHomeOnlyLabel(label)}
      onClick={() => explainHomeOnly(procedure)}
    />
  );
}

export { HomeOnlyPill };
export { explainAway, explainHomeOnly, explainIfHomeOnly, homeOnlyWhat } from './explain';

// ── The banner ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * "You're using hlabs from the internet…": a pill at the top of Home (HomePublicAddress), a strip at the top of a
 * window (HomeOnlyAction), and on a phone a strip at the top of every page. Nothing at home or on the tailnet.
 */
export function InternetBanner({ variant, className }: { variant: 'home' | 'window'; className?: string }) {
  const onPublic = useOnPublic();
  const phone = useIsPhone();
  if (!onPublic) return null;
  const pill = variant === 'home' && !phone;
  return (
    <div role="note" className={cn('hl-net-banner', pill ? 'hl-net-banner-pill' : 'hl-net-banner-strip', className)}>
      <Globe aria-hidden {...iconDefaults} size={16} />
      <span>{copy.banner}</span>
    </div>
  );
}
