// OnbApps (US-ONB-19, US-ONB-20): a few popular apps to install right away. None are picked to start; each tile toggles
// (aria-pressed), one that recommends more memory than the engine has free says so but can still be picked. "Install
// and finish" queues their installs and completes onboarding without waiting; "Skip" just completes it.
import type { StoreApp } from '@hlabs/api';
import { enabledOnboardingSteps, VISIBLE_PHASE } from '@hlabs/shared';
import { AppLogo, appTileLook, Check, iconDefaults, TriangleAlert } from '@hlabs/icons';
import { Badge, Button, tokens } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { errorCode, errorData } from '../lib/error-copy';
import { clearSetupToken } from '../lib/setup-token';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { StepFrame } from './step-frame';

const copy = onboardingCopy.apps;
const TILE_LOGO = tokens.SIZE_DOCK_TILE;

export function AppsStep({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const starters = useQuery({ ...trpc.onboarding.starterApps.queryOptions(), retry: false });
  const [picked, setPicked] = useState<string[]>([]);
  const steps = enabledOnboardingSteps(shippedPhase);
  const previous = steps[steps.indexOf('apps') - 1] ?? 'storage';

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Install and finish (appIds) or Skip (none): onboarding completes either way, then the finish screen.
  const finish = useMutation({
    mutationFn: async (appIds: string[]) => {
      if (appIds.length > 0) await client.onboarding.installStarterApps.mutate({ appIds });
      await client.onboarding.complete.mutate();
      clearSetupToken();
    },
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
      await navigate({ to: '/setup/$step', params: { step: 'done' } });
    },
    onError: (err) => {
      // A required step is missing after all: go back to it (US-ONB-22).
      const missing = errorData(err)?.detail?.missing;
      if (errorCode(err) === 'ONBOARDING_INCOMPLETE' && (missing === 'account' || missing === 'storage')) {
        void navigate({ to: '/setup/$step', params: { step: missing } });
      }
    },
  });
  // Pick order follows the grid, whatever order they were tapped in.
  const ordered = (starters.data?.apps ?? []).map((s) => s.app.id).filter((id) => picked.includes(id));

  return (
    <StepFrame step="apps" title={onboardingCopy.titles.apps} shippedPhase={shippedPhase} wide>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <ul aria-label={copy.label} className="m-0 mt-6 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
        {(starters.data?.apps ?? []).map(({ app, needsMoreMemory }) => {
          const on = picked.includes(app.id);
          return (
            <li key={app.id} className="flex">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(app.id)}
                className="hl-focus relative flex min-h-36 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border-glass bg-surface-row px-2 py-4 text-ink aria-pressed:border-[1.5px] aria-pressed:border-accent aria-pressed:bg-accent-wash"
              >
                {on ? (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 grid size-5 place-items-center rounded-pill bg-accent text-ink-on-light"
                  >
                    <Check {...iconDefaults} className="size-3" />
                  </span>
                ) : null}
                <TileLogo app={app} />
                <span className="text-body-sm font-bold">{app.name}</span>
                {needsMoreMemory ? (
                  <span className="flex items-center gap-1 text-caption text-warning">
                    <TriangleAlert aria-hidden {...iconDefaults} className="size-3.5" />
                    {copy.needsMemory}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {finish.isError && errorCode(finish.error) !== 'ONBOARDING_INCOMPLETE' ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {copy.failed}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="link" onClick={() => void navigate({ to: '/setup/$step', params: { step: previous } })}>
            {onboardingCopy.back}
          </Button>
          <span aria-live="polite" className="text-body-sm text-ink-muted">
            {picked.length > 0 ? copy.selected(picked.length) : null}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="link" disabled={finish.isPending} onClick={() => finish.mutate([])}>
            {copy.skip}
          </Button>
          <Button
            size="lg"
            disabled={picked.length === 0 || finish.isPending}
            aria-busy={finish.isPending}
            onClick={() => finish.mutate(ordered)}
          >
            {copy.installAndFinish}
            {picked.length > 0 ? <Badge tone="accent">{picked.length}</Badge> : null}
          </Button>
        </div>
      </div>
    </StepFrame>
  );
}

/** The app's logo, decorative: the tile is named by the app's name below it. */
function TileLogo({ app }: { app: StoreApp }) {
  const look = appTileLook(app.name, app.icon, TILE_LOGO);
  return (
    <AppLogo
      decorative
      name={app.name}
      src={app.icon.logoUrl}
      colors={look.colors}
      fallbackIcon={look.fallbackIcon}
      size={TILE_LOGO}
      style={{ boxShadow: 'var(--shadow-icon)' }}
    />
  );
}
