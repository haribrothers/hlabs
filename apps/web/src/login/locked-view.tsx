// LoginLocked (US-AUTH-12, US-AUTH-13): logging in as this username from this device is paused; a countdown from the server's
// retryAfter, then back to the password screen.
import { isFeatureEnabled } from '@hlabs/shared';
import { Lock, iconDefaults } from '@hlabs/icons';
import { Button, GlassCard } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPC } from '../lib/trpc';
import { LoginLayout } from './login-layout';
import { forgetRememberedUser } from './remembered';
import { withNext } from './search';

const copy = loginCopy;

/** `4:59` */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Milliseconds until `until`, ticking every second. */
function useTimeLeft(until: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const left = until === undefined ? 0 : Math.max(0, until - now);
  const running = left > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return left;
}

export function LockedView({ user, until, next }: { user?: string; until?: number; next?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  const listShown = (list.data?.users.length ?? 0) > 0;
  const left = useTimeLeft(until);
  const time = formatCountdown(left);
  const heading = useRef<HTMLHeadingElement>(null);
  // Read out once on arrival, not on every tick.
  useEffect(() => heading.current?.focus(), []);

  return (
    <LoginLayout note={copy.adminNotified}>
      <GlassCard className="mb-2 grid size-18 place-items-center rounded-full p-0 text-warning">
        <Lock aria-hidden {...iconDefaults} />
      </GlassCard>
      <h1 ref={heading} tabIndex={-1} className="m-0 text-display outline-none">
        {copy.lockedTitle}
      </h1>
      <p className="m-0 text-body text-ink-muted">
        {user ? (
          <>
            {copy.lockedLead} <strong className="text-ink">@{user}</strong> {copy.lockedLeadEnd}
          </>
        ) : (
          copy.lockedLeadNoUser
        )}
      </p>
      {left > 0 ? (
        <p role="timer" aria-label={copy.timeLeft} className="m-0 mt-2 text-display-xl tabular-nums">
          {time}
        </p>
      ) : null}
      <Button
        size="lg"
        className="mt-2 w-full max-w-sm"
        disabled={left > 0}
        onClick={() =>
          void navigate(
            user
              ? { to: '/login/password', search: { user, ...withNext(next) } }
              : { to: '/login', search: withNext(next) },
          )
        }
      >
        {left > 0 ? copy.tryAgainIn(time) : copy.tryAgain}
      </Button>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-body-sm">
        {isFeatureEnabled('forgotPassword') ? (
          <Link to="/login" search={withNext(next)} className="hl-focus rounded-xs text-ink no-underline">
            {copy.forgot}
          </Link>
        ) : null}
        <Link
          to={listShown ? '/login/users' : '/login/username'}
          search={withNext(next)}
          onClick={() => forgetRememberedUser()}
          className="hl-focus rounded-xs text-ink no-underline"
        >
          {copy.useAnother}
        </Link>
      </div>
    </LoginLayout>
  );
}
