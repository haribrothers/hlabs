// The log-in pages: centred on the wallpaper, an optional back link top left, and the host you reached hlabs on.
import { ChevronLeft, Lock, iconDefaults } from '@hlabs/icons';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { loginCopy } from '../copy/login';

/** "hlabs.local · secured with HTTPS", or just the host when it isn't HTTPS (development). */
export function hostLine(location: Pick<Location, 'host' | 'protocol'>) {
  return location.protocol === 'https:' ? loginCopy.secure(location.host) : location.host;
}

export function LoginLayout({
  back,
  note,
  children,
}: {
  back?: { label: string; to: string; search?: object };
  /** A line at the foot of the page, above the host. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="hl-wall flex min-h-full flex-col">
      {back ? (
        <nav className="px-4 pt-4 md:px-8 md:pt-6">
          <Link
            to={back.to}
            search={back.search}
            className="hl-focus inline-flex items-center gap-1 rounded-xs text-body-sm text-ink no-underline"
          >
            <ChevronLeft aria-hidden {...iconDefaults} />
            {back.label}
          </Link>
        </nav>
      ) : null}
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">{children}</main>
      <footer className="flex flex-col items-center gap-2 px-4 pb-6 text-center text-caption text-ink-muted">
        {note ? <p className="m-0">{note}</p> : null}
        <p className="m-0 flex items-center justify-center gap-2">
          {/* The padlock only when the connection really is HTTPS. */}
          {window.location.protocol === 'https:' ? <Lock aria-hidden {...iconDefaults} className="size-3" /> : null}
          {hostLine(window.location)}
        </p>
      </footer>
    </div>
  );
}
