// One card for every Home widget (Phase 7 · Widgets): a fixed height (156 px, 122 px on a phone where two sit side by
// side), the title on top with its state on the right in colour and words, one main figure, and the detail pinned to
// the bottom: a bar, chips, recent runs, app logos or what to do next. Level-1 glass (09 §Glass levels).
import { AppLogo, appTileLook, ChevronRight, iconDefaults, RotateCw } from '@hlabs/icons';
import { cn, tokens } from '@hlabs/ui';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { homeCopy } from '../copy/home';

const copy = homeCopy;

export const WIDGET_CARD =
  'hl-card hl-glass hl-glass-1 h-widget-phone md:h-widget min-w-0 justify-between gap-2 overflow-hidden text-left text-ink no-underline max-md:rounded-lg max-md:px-3.5 max-md:py-3';

export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'muted';
const TONE: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-danger',
  accent: 'text-accent-link',
  muted: 'text-ink-faint',
};
const DOT: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-danger',
  accent: 'bg-accent',
  muted: 'bg-ink-faint',
};

/** The state, top right: a dot (or an icon) and words, so it's never colour alone. `short` where two widgets share a
 * phone's width. */
export function WidgetState({
  tone,
  icon,
  short,
  children,
}: {
  tone: Tone;
  icon?: ReactNode;
  short?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 text-caption font-semibold', TONE[tone])}>
      {icon ?? <span aria-hidden className={cn('size-2 shrink-0 rounded-pill', DOT[tone])} />}
      {short ? (
        <>
          <span className="md:hidden">{short}</span>
          <span className="truncate max-md:hidden">{children}</span>
        </>
      ) : (
        <span className="truncate">{children}</span>
      )}
    </span>
  );
}

type Target =
  { to: LinkProps['to']; params?: LinkProps['params']; state?: LinkProps['state'] } | { onClick: () => void };

/** The card: a link (or a button) to where the widget leads, else a plain block. */
export function WidgetCard({
  title,
  state,
  target,
  busy,
  children,
}: {
  title: ReactNode;
  state?: ReactNode;
  target?: Target;
  busy?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="m-0 min-w-0 truncate text-caption font-medium text-ink-muted md:text-label md:font-medium">
          {title}
        </h2>
        {state}
      </div>
      {children}
    </>
  );
  if (target && 'to' in target) {
    return (
      <Link
        to={target.to}
        params={target.params as never}
        state={target.state as never}
        className={cn(WIDGET_CARD, 'hl-focus')}
        aria-busy={busy || undefined}
      >
        {body}
      </Link>
    );
  }
  if (target) {
    return (
      <button
        type="button"
        onClick={target.onClick}
        className={cn(WIDGET_CARD, 'hl-focus cursor-pointer')}
        aria-busy={busy || undefined}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={WIDGET_CARD} aria-busy={busy || undefined}>
      {body}
    </div>
  );
}

/** The main figure and its unit: "142 GB left of 256 GB". */
export function Hero({ value, unit }: { value: ReactNode; unit?: ReactNode }) {
  return (
    <p className="m-0 flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-title-2 font-bold tabular-nums md:text-title-1">{value}</span>
      {unit ? ' ' : null}
      {unit ? <span className="truncate text-caption text-ink-muted md:text-label md:font-normal">{unit}</span> : null}
    </p>
  );
}

/** A main line in words ("2 hours ago", "hlabs.tailnet") and the line under it. */
export function HeroLine({ children, sub, size = 'lg' }: { children: ReactNode; sub?: ReactNode; size?: 'lg' | 'md' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p
        className={cn(
          'm-0',
          size === 'lg'
            ? 'truncate text-body font-semibold md:text-title-2 md:font-semibold'
            : 'line-clamp-2 text-body-sm font-medium md:text-body md:font-medium',
        )}
      >
        {children}
      </p>
      {sub ? <Sub>{sub}</Sub> : null}
    </div>
  );
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('m-0 truncate text-caption text-ink-muted md:text-label md:font-normal', className)}>{children}</p>
  );
}

/** A bar of parts: each a share of the whole, in its own colour class. */
export function Bar({
  parts,
  thin = false,
  label,
}: {
  parts: Array<{ pct: number; className: string }>;
  thin?: boolean;
  /** What it shows, for a screen reader; without it the bar is decoration. */
  label?: string;
}) {
  return (
    <div
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('flex overflow-hidden rounded-pill bg-surface-control', thin ? 'h-1.5' : 'h-1.5 md:h-2')}
    >
      {parts.map((p, i) => (
        <div key={i} className={p.className} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%` }} />
      ))}
    </div>
  );
}

/** Recent runs, oldest first: height from what each copied, the newest in the accent, failed ones red. */
export function RunBars({ runs }: { runs: Array<{ height: number; failed: boolean }> }) {
  return (
    <div aria-hidden className="flex h-3.5 items-end gap-0.75 md:h-5.5 md:gap-1">
      {runs.map((r, i) => (
        <div
          key={i}
          className={cn(
            'grow rounded-[var(--space-1)]',
            r.failed ? 'h-1 bg-danger' : i === runs.length - 1 ? 'bg-accent' : 'bg-ink-faint opacity-70',
          )}
          style={r.failed ? undefined : { height: `${Math.round(r.height * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <span className="hidden gap-1.5 md:flex">
      {items.map((c) => (
        <span key={c} className="rounded-pill bg-surface-control px-2.5 py-1 text-caption">
          {c}
        </span>
      ))}
    </span>
  );
}

/** What to do next, at the bottom: "Set up ›". The whole card is the link; this only says where it goes. */
export function GoOn({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-caption font-semibold md:text-label">
      {children}
      <ChevronRight aria-hidden {...iconDefaults} className="size-3.5" />
    </span>
  );
}

type NamedApp = {
  id: string;
  name: string;
  icon: { logoUrl: string | null; gradient: [string, string] | null; fallback: string | null };
};

/** A few apps' logos in a row (overlapping when `stacked`). */
export function AppLogos({ apps, stacked = false }: { apps: NamedApp[]; stacked?: boolean }) {
  const size = tokens.SPACE_6 + tokens.SPACE_1;
  return (
    <span aria-hidden className={cn('flex', stacked ? '-space-x-2' : 'gap-1.5')}>
      {apps.map((a) => {
        const look = appTileLook(a.name, a.icon, size);
        return (
          <span key={a.id} className={cn('rounded-sm', stacked && 'ring-2 ring-[var(--wall-base)]')}>
            <AppLogo
              decorative
              name={a.name}
              src={a.icon.logoUrl}
              colors={look.colors}
              fallbackIcon={look.fallbackIcon}
              size={size}
              radius={tokens.SPACE_2}
            />
          </span>
        );
      })}
    </span>
  );
}

/** Loading: the final layout, faintly. */
export function WidgetSkeleton({ title }: { title: ReactNode }) {
  return (
    <WidgetCard title={title} busy>
      <div aria-hidden className="flex animate-pulse flex-col gap-2.5">
        <div className="h-6 w-1/2 rounded-xs bg-surface-control" />
        <div className="h-2 rounded-pill bg-surface-control" />
        <div className="hidden h-2.5 w-2/3 rounded-pill bg-surface-control md:block" />
      </div>
    </WidgetCard>
  );
}

/** Couldn't load: what, why, and Try again. */
export function WidgetCouldntLoad({ title, retry }: { title: string; retry: () => void }) {
  return (
    <WidgetCard title={title}>
      <HeroLine size="md" sub={<span className="max-md:hidden">{copy.widget.didntAnswer}</span>}>
        {copy.widget.couldntLoadNamed(title)}
      </HeroLine>
      <button
        type="button"
        onClick={retry}
        className="hl-focus flex h-8 items-center gap-1.5 self-start rounded-pill border-0 bg-surface-control px-3.5 text-caption font-semibold text-ink md:text-label"
      >
        <RotateCw aria-hidden {...iconDefaults} className="size-3.5" />
        {copy.retry}
      </button>
    </WidgetCard>
  );
}
