// The log-in pages: centred on the wallpaper, an optional back link top left, and the host you reached hlabs on.
import { ChevronLeft, Lock, iconDefaults } from '@hlabs/icons';
import { PhoneBackButton, useIsPhone } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { loginCopy } from '../copy/login';

/** "hlabs.local · secured with HTTPS", or just the host when it isn't HTTPS (development). */
export function hostLine(location: Pick<Location, 'host' | 'protocol'>) {
  return location.protocol === 'https:' ? loginCopy.secure(location.host) : location.host;
}

/** PhoneLogin's footer (US-PHONE-05): "via Tailscale · <host>" on the tailnet name, else just the host. */
export function phoneHostLine(location: Pick<Location, 'host' | 'hostname'>): string {
  return /\.ts\.net$/i.test(location.hostname) ? loginCopy.viaTailscale(location.host) : location.host;
}

export function LoginLayout({
  back,
  onBack,
  note,
  children,
}: {
  back?: { label: string; to: string; search?: object };
  /** On a phone: a back control that runs this instead of a link (the code step, US-PHONE-06). */
  onBack?: { label: string; onBack: () => void };
  /** A line at the foot of the page, above the host. */
  note?: ReactNode;
  children: ReactNode;
}) {
  const phone = useIsPhone();
  if (phone)
    // The log-in screens on a phone (US-PHONE-05, US-PHONE-06, D-172): full screen in one column, "‹ Back" at the top
    // clear of the notch, the content from the top, and the host at the foot.
    return (
      <div className="hl-wall hl-login-phone flex min-h-full flex-col">
        {back || onBack ? (
          <nav className="px-4 pt-[calc(var(--space-4)+env(safe-area-inset-top))]">
            {back ? (
              <Link to={back.to} search={back.search} className="hl-p-back hl-focus -ml-2">
                <ChevronLeft aria-hidden {...iconDefaults} className="hl-p-back-chevron" />
                {back.label}
              </Link>
            ) : (
              <PhoneBackButton {...onBack!} className="-ml-2" />
            )}
          </nav>
        ) : (
          <div aria-hidden className="pt-[calc(var(--space-4)+env(safe-area-inset-top))]" />
        )}
        <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-8">{children}</main>
        <footer className="flex flex-col items-center gap-2 px-4 pb-[calc(var(--space-6)+env(safe-area-inset-bottom))] text-center text-footnote text-ink-muted">
          {note ? <p className="m-0">{note}</p> : null}
          <p className="m-0">{phoneHostLine(window.location)}</p>
        </footer>
      </div>
    );
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
