// Backups on a phone (US-PHONE-26, PhoneRedesignA_Backups, _BackupsEmpty; D-172, D-174): under "‹ Settings" and the
// "Backups" title, a card with the last backup, when the next one is, the last runs as bars and "Back up now" (or,
// with no destination yet, "No backups yet" and "Add a destination"); then the destinations, what's included, the
// schedule and Restore… as inset rows, and the recent runs with their status at the right. What each does is the
// desktop's (US-BKP-01…04, US-BKP-23): only the layout differs.
import type { AppRouter } from '@hlabs/api';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  HardDrive,
  History,
  iconDefaults,
  ListChecks,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from '@hlabs/icons';
import { Badge, InsetGroup, InsetRow, InsetRowButton, PhoneCard, Progress, cn } from '@hlabs/ui';
import type { inferRouterOutputs } from '@trpc/server';
import { backupsCopy as copy } from '../copy/backups';
import { timeAgo } from '../lib/relative-time';
import { dayTime, destinationLine, retentionWords, runLine, scheduleWords, whenNext } from './format';

type Overview = inferRouterOutputs<AppRouter>['backups']['overview'];
type Run = inferRouterOutputs<AppRouter>['backups']['listRuns']['runs'][number];

/** How many runs the card's bars show. */
const BARS = 10;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The last runs as bars (PhoneRedesignA_Backups): height by the data changed; a failed one short, red, with ✕. */
function RunBars({ runs, now }: { runs: Overview['chart']; now: number }) {
  const last = runs.slice(-BARS);
  if (!last.length) return null;
  const failed = last.filter((r) => r.status === 'failed');
  const peak = Math.max(1, ...last.map((r) => r.bytesAdded ?? 0));
  const label = copy.barsLabel(
    last.length,
    failed.length,
    failed.at(-1) ? dayTime(failed.at(-1)!.startedAt, now) : null,
  );
  return (
    <div role="img" aria-label={label} className="hl-p-runbars">
      {last.map((r, i) =>
        r.status === 'failed' ? (
          <span key={`${r.startedAt}-${i}`} className="hl-p-runbar-failed">
            <X aria-hidden {...iconDefaults} />
            <span />
          </span>
        ) : (
          <span
            key={`${r.startedAt}-${i}`}
            className="hl-p-runbar"
            // A share of the bar's height: at least a sliver for a run that changed nothing.
            style={{ height: `${Math.max(12, Math.round(((r.bytesAdded ?? 0) / peak) * 100))}%` }}
          />
        ),
      )}
    </div>
  );
}

export function PhoneBackups({
  o,
  runs,
  now,
  backingUp,
  details,
  onBackUp,
  onAdd,
  onEdit,
  onIncluded,
  onRestore,
}: {
  o: Overview;
  runs: Run[];
  now: number;
  /** "Back up now" was pressed and hasn't answered yet. */
  backingUp: boolean;
  /** A failed run has a detail page (a later phase, D-036). */
  details: boolean;
  onBackUp: () => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onIncluded: () => void;
  onRestore: () => void;
}) {
  const none = o.destinations.length === 0;
  const last = o.lastRun;
  const failed = last?.status === 'failed';
  const blocked = o.blockedBy !== null;
  const title = failed
    ? copy.lastFailed(dayTime(last.startedAt, now))
    : o.lastSuccessAt
      ? capital(timeAgo(o.lastSuccessAt, now))
      : copy.noBackups;
  const next =
    o.scheduleEnabled && o.nextRunAt !== null ? copy.nextShort(whenNext(o.nextRunAt, now)) : copy.scheduleOff;

  const card = none ? (
    <PhoneCard className="hl-p-empty" role="region" aria-labelledby="backups-empty-title">
      <span aria-hidden className="hl-p-empty-icon">
        <History {...iconDefaults} />
      </span>
      <h2 id="backups-empty-title" className="hl-p-empty-title">
        {copy.noBackups}
      </h2>
      <p className="hl-p-empty-body">{copy.noBackupsBody}</p>
      <button type="button" className="hl-p-primary hl-focus" onClick={onAdd}>
        {copy.addDestinationPhone}
      </button>
    </PhoneCard>
  ) : (
    <PhoneCard className="flex flex-col gap-3.5" role="region" aria-label={failed ? title : copy.lastBackup(title)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn('hl-p-state-icon', failed ? 'text-danger' : last ? 'text-success' : 'text-ink')}
        >
          {failed ? (
            <TriangleAlert {...iconDefaults} />
          ) : last ? (
            <CircleCheck {...iconDefaults} />
          ) : (
            <Clock {...iconDefaults} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={cn('hl-p-state-title', failed && 'text-danger')}>{title}</p>
          <p className="hl-p-state-sub">{next}</p>
          {o.overdue || o.included.notBackedUp ? (
            <p className="hl-p-state-sub flex flex-wrap items-center gap-2">
              {o.overdue ? <Badge tone="warning">{copy.overdue}</Badge> : null}
              {o.included.notBackedUp ? copy.notBackedUp(o.included.notBackedUp) : null}
            </p>
          ) : null}
        </div>
      </div>
      <RunBars runs={o.chart} now={now} />
      <button
        type="button"
        className="hl-p-primary hl-focus"
        disabled={blocked || !!o.running || backingUp}
        aria-busy={backingUp || undefined}
        title={blocked ? copy.waitForTask : undefined}
        onClick={onBackUp}
      >
        {o.running ? copy.backingUp(o.running.progress) : copy.backUpNow}
      </button>
    </PhoneCard>
  );

  return (
    <div className="flex flex-col gap-5">
      {card}
      <InsetGroup footer={none ? copy.restoreAfterFirst : `${retentionWords(o.plan.retention)}.`}>
        {o.destinations.map((d) => (
          <InsetRowButton
            key={d.id}
            icon={<HardDrive aria-hidden {...iconDefaults} />}
            tone="store"
            title={d.name}
            subtitle={
              <>
                <span className="block font-mono">{d.location}</span>
                <span className="block">{destinationLine(d)}</span>
              </>
            }
            trailing={
              <span
                className={cn(
                  'hl-p-status hl-p-status-lg',
                  d.status === 'ok' ? 'text-success' : d.status === 'unreachable' ? 'text-danger' : 'text-warning',
                )}
              >
                {copy.status[d.status]}
              </span>
            }
            chevron
            onClick={() => onEdit(d.id)}
          />
        ))}
        {none ? null : (
          <InsetRowButton
            icon={<Plus aria-hidden {...iconDefaults} />}
            title={copy.addDestinationPhone}
            subtitle={o.destinations.some((d) => d.offsite) ? undefined : copy.offsiteHint}
            accent
            onClick={onAdd}
          />
        )}
        {none ? null : (
          <InsetRowButton
            icon={<ListChecks aria-hidden {...iconDefaults} />}
            title={copy.includedTitle}
            subtitle={copy.apps(o.included.apps)}
            chevron
            onClick={onIncluded}
          />
        )}
        <InsetRow
          icon={<Clock aria-hidden {...iconDefaults} />}
          title={copy.scheduleRow}
          value={scheduleWords(o.plan.scheduleCron)}
        />
        <InsetRowButton
          icon={<RotateCcw aria-hidden {...iconDefaults} />}
          title={copy.restore}
          chevron={!none}
          disabled={none || blocked}
          onClick={onRestore}
        />
      </InsetGroup>
      {runs.length ? (
        <InsetGroup label={copy.recent} labelId="backups-recent">
          {runs.map((r) =>
            r.status === 'running' ? (
              <div key={r.id} className="hl-p-row flex-col !items-stretch">
                <div className="flex items-center gap-3">
                  <span className="hl-p-row-text">
                    <span className="hl-p-row-title">{copy.now}</span>
                    <span className="hl-p-row-sub">{copy.runningLine(o.running?.progress ?? 0)}</span>
                  </span>
                  <span className="hl-p-run-status text-accent-link">{copy.runStatus.running}</span>
                </div>
                <Progress
                  value={o.running?.progress ?? 0}
                  aria-label={copy.runningLine(o.running?.progress ?? 0)}
                  className="mb-3 min-w-0"
                />
              </div>
            ) : (
              <InsetRow
                key={r.id}
                title={dayTime(r.startedAt, now)}
                subtitle={runLine(r)}
                trailing={
                  <span className={cn('hl-p-run-status', r.status === 'failed' ? 'text-danger' : 'text-success')}>
                    {r.status === 'failed' ? (
                      <CircleAlert aria-hidden {...iconDefaults} />
                    ) : r.status === 'succeeded' ? (
                      <CircleCheck aria-hidden {...iconDefaults} />
                    ) : null}
                    {copy.runStatus[r.status]}
                  </span>
                }
                chevron={r.status === 'failed' && details}
              />
            ),
          )}
        </InsetGroup>
      ) : null}
    </div>
  );
}
