// "You don't have access to this" (US-STATE-20), shown at the same URL, and its pre-phase-8 "Page not found" twin.
import { Lock, iconDefaults } from '@hlabs/icons';
import { Avatar, avatarColorFor, GlassCard } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { accessCopy } from '../copy/settings';
import { useMe } from '../lib/use-me';

const copy = accessCopy;

export function AccessDenied({ kind = 'denied' }: { kind?: 'denied' | 'notFound' }) {
  const me = useMe().data;
  useEffect(() => {
    if (kind === 'denied') document.title = copy.noAccessDocTitle;
  }, [kind]);
  return (
    <GlassCard level={2} className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-7 text-center">
      <span className="grid size-16 place-items-center rounded-pill bg-surface-control">
        <Lock aria-hidden {...iconDefaults} />
      </span>
      <h1 className="m-0 text-title-1">{kind === 'denied' ? copy.noAccessTitle : copy.notFoundTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{kind === 'denied' ? copy.noAccessBody : copy.notFoundBody}</p>
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
