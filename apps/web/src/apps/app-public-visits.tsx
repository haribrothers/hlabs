// Visits (US-APP-29; AppPublicVisits): the last 7 days of requests to a public app's address, newest first, filtered
// by result, with addresses refused right now after too many failed sign-ins. Admins only (App settings is), and the
// daemon refuses members too.
import type { AppDetail, Visit, VisitResult } from '@hlabs/api';
import { Ban, Check, ChevronLeft, LogIn, TriangleAlert, iconDefaults } from '@hlabs/icons';
import { Button, IconButton } from '@hlabs/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { countryName, publicCopy as copy } from '../copy/public';
import { useTRPC } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { useNow } from '../lib/use-now';
import { useMakePrivate } from '../public/make-private';

const RESULTS: VisitResult[] = ['signedIn', 'askedToSignIn', 'refused', 'tooManyTries'];
const PAGE = 50;

const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** "Today 17:42", "Yesterday 22:30", "3 Dec 09:12". */
export function visitTime(at: number, now: number): string {
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(at) === day(now)) return `${copy.today} ${time(at)}`;
  if (day(at) === day(now - 86_400_000)) return `${copy.yesterday} ${time(at)}`;
  return `${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time(at)}`;
}

const RESULT_LOOK: Record<VisitResult, { className: string; icon: ReactNode }> = {
  signedIn: { className: 'text-success', icon: <Check aria-hidden {...iconDefaults} size={14} /> },
  askedToSignIn: { className: 'text-ink-muted', icon: <LogIn aria-hidden {...iconDefaults} size={14} /> },
  refused: { className: 'text-danger', icon: <Ban aria-hidden {...iconDefaults} size={14} /> },
  tooManyTries: { className: 'text-warning', icon: <TriangleAlert aria-hidden {...iconDefaults} size={14} /> },
};

function Result({ result }: { result: VisitResult }) {
  const look = RESULT_LOOK[result];
  return (
    <span className={`flex items-center gap-1.5 font-semibold ${look.className}`}>
      {look.icon}
      {copy.results[result]}
    </span>
  );
}

function VisitRow({ v, now, desktop }: { v: Visit; now: number; desktop: boolean }) {
  const country = countryName(v.country);
  const from = (
    <span className="flex min-w-0 flex-col gap-px">
      <span className="font-mono">{v.ip}</span>
      {country ? <span className="text-caption text-ink-muted">{country}</span> : null}
    </span>
  );
  if (!desktop)
    return (
      <li className="flex flex-col gap-1 border-hairline px-4 py-3 text-body-sm not-first:border-t">
        <span className="flex items-center justify-between gap-3">
          <span>{visitTime(v.at, now)}</span>
          <Result result={v.result} />
        </span>
        {from}
        <span className="truncate font-mono text-ink-muted">{v.path}</span>
      </li>
    );
  return (
    <div
      role="row"
      className="grid grid-cols-[150px_200px_1fr_170px] items-center gap-4 border-t border-hairline px-4.5 py-2.5 text-body-sm"
    >
      <span role="cell">{visitTime(v.at, now)}</span>
      <span role="cell">{from}</span>
      <span role="cell" className="truncate font-mono text-ink-muted">
        {v.path}
      </span>
      <span role="cell">
        <Result result={v.result} />
      </span>
    </div>
  );
}

export function AppPublicVisits({ app, onBack }: { app: AppDetail; onBack: () => void }) {
  const trpc = useTRPC();
  const desktop = useIsDesktop();
  const now = useNow().getTime();
  const makePrivate = useMakePrivate();
  const [show, setShow] = useState<VisitResult | 'all'>('all');
  const visits = useInfiniteQuery({
    ...trpc.apps.publicVisits.infiniteQueryOptions(
      { appId: app.id, limit: PAGE, ...(show === 'all' ? {} : { result: show }) },
      { getNextPageParam: (p) => p.nextCursor },
    ),
    retry: false,
  });
  const items = visits.data?.pages.flatMap((p) => p.items) ?? [];
  const refused = visits.data?.pages[0]?.refused ?? [];
  const pub = app.public ?? null;

  return (
    <section aria-label={copy.visitsTitle(app.name)} className="flex min-h-0 flex-col gap-4">
      <header className="flex items-center gap-3">
        <IconButton label={copy.back(app.name)} onClick={onBack} className="rounded-pill">
          <ChevronLeft aria-hidden {...iconDefaults} className="size-4" />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 text-title-2 font-bold">{copy.visitsTitle(app.name)}</h2>
          <span className="text-caption text-ink-muted">
            {pub ? (
              <>
                {copy.requestsTo} <span className="font-mono">{pub.address}</span> {copy.visitsLead}
              </>
            ) : (
              copy.notPublicNow(app.name)
            )}
          </span>
        </div>
        {pub ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void makePrivate({ appId: app.id, name: app.name, address: pub.address })}
          >
            {copy.makePrivate}
          </Button>
        ) : null}
      </header>
      {refused.map((r) => {
        const text = copy.refused(r.ip, time(r.until), r.failures);
        return (
          <div
            key={r.ip}
            role="status"
            className="flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3.5 py-3 text-body-sm"
          >
            <TriangleAlert aria-hidden {...iconDefaults} size={18} className="mt-0.5 shrink-0 text-warning" />
            <span>
              <strong>{text.strong}</strong> {text.rest} {copy.refusedAdvice(app.name)}
            </span>
          </div>
        );
      })}
      <div role="group" aria-label={copy.show} className="flex flex-wrap gap-2">
        {(['all', ...RESULTS] as const).map((k) => {
          const on = show === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setShow(k)}
              className={`hl-focus h-8 cursor-pointer rounded-pill border-0 px-3.5 text-body-sm max-md:h-11 ${
                on ? 'bg-fill-primary font-semibold text-ink-on-light' : 'bg-surface-control text-ink'
              }`}
            >
              {k === 'all' ? copy.all : copy.results[k]}
            </button>
          );
        })}
      </div>
      {visits.isError ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {copy.visitsFailed}
        </p>
      ) : !visits.data ? (
        <div role="status" aria-label={copy.visitsTitle(app.name)} className="hl-skeleton h-24 w-full rounded-md" />
      ) : items.length === 0 ? (
        <p className="m-0 rounded-md bg-surface-row px-4 py-3 text-body-sm text-ink-muted">
          {show === 'all' ? copy.noVisits : copy.noVisitsFiltered}
        </p>
      ) : desktop ? (
        <div role="table" aria-label={copy.visits} className="overflow-hidden rounded-md bg-surface-row">
          <div
            role="row"
            className="grid grid-cols-[150px_200px_1fr_170px] gap-4 px-4.5 py-2.5 text-caption font-semibold text-ink-muted"
          >
            <span role="columnheader">{copy.when}</span>
            <span role="columnheader">{copy.from}</span>
            <span role="columnheader">{copy.page}</span>
            <span role="columnheader">{copy.result}</span>
          </div>
          {items.map((v, i) => (
            <VisitRow key={`${v.at}-${i}`} v={v} now={now} desktop />
          ))}
        </div>
      ) : (
        <ul aria-label={copy.visits} className="m-0 list-none overflow-hidden rounded-sm bg-solid-widget p-0">
          {items.map((v, i) => (
            <VisitRow key={`${v.at}-${i}`} v={v} now={now} desktop={false} />
          ))}
        </ul>
      )}
      {visits.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            busy={visits.isFetchingNextPage}
            onClick={() => void visits.fetchNextPage()}
          >
            {copy.loadMore}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
