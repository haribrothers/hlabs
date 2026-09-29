// "You don't have access to this" (US-STATE-20), shown at the same URL, its pre-phase-8 "Page not found" twin, and
// "Something went wrong" for a page that failed in another way (never the raw error).
import { Lock, iconDefaults } from '@hlabs/icons';
import { Avatar, avatarColorFor, GlassCard } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { errorCopy } from '../copy/errors';
import { accessCopy } from '../copy/settings';
import { useMe } from '../lib/use-me';

const copy = accessCopy;

const TEXT = {
  denied: { title: accessCopy.noAccessTitle, body: accessCopy.noAccessBody },
  notFound: { title: accessCopy.notFoundTitle, body: accessCopy.notFoundBody },
  error: errorCopy.generic,
} as const;

export function AccessDenied({ kind = 'denied' }: { kind?: 'denied' | 'notFound' | 'error' }) {
  const me = useMe().data;
  useEffect(() => {
    if (kind === 'denied') document.title = copy.noAccessDocTitle;
  }, [kind]);
  return (
    <GlassCard level={2} className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-7 text-center">
      <span className="grid size-16 place-items-center rounded-pill bg-surface-control">
        <Lock aria-hidden {...iconDefaults} />
      </span>
      <h1 className="m-0 text-title-1">{TEXT[kind].title}</h1>
      <p className="m-0 text-body text-ink-muted">{TEXT[kind].body}</p>
      {kind === 'denied' && me ? (
        <div className="flex w-full items-center gap-3 rounded-md bg-surface-control p-3 text-left">
          <Avatar name={me.displayName} color={avatarColorFor(me.username, me.avatarColor)} size="md" />
          <span className="text-body-sm font-semibold">{copy.signedInAs(me.username)}</span>
        </div>
      ) : null}
      <Link to="/" className="hl-btn hl-btn-primary hl-btn-lg hl-focus no-underline">
        {copy.goHome}
      </Link>
    </GlassCard>
  );
}
