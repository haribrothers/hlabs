// The App Store window (US-STORE-01, US-STORE-02): on desktop a sidebar ("Back to Home", the title, Discover and the
// categories) and the open view; on a phone the title and views, with categories as a chip row.
import { ChevronLeft, iconDefaults } from '@hlabs/icons';
import { GlassCard, ScrollPane } from '@hlabs/ui';
import { Link, Outlet } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { storeCopy } from '../copy/store';
import { useIsDesktop } from '../lib/use-media';

const copy = storeCopy;

const navItem =
  'hl-focus flex min-h-11 items-center justify-between rounded-md px-3 text-body text-ink no-underline hover:bg-surface-control aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold';

export function StoreSidebar() {
  return (
    <nav aria-label={copy.categories}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        <li>
          <Link
            to="/store"
            activeOptions={{ exact: true }}
            className={navItem}
            activeProps={{ 'aria-current': 'page' }}
          >
            {copy.discover}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export function StoreLayout() {
  const desktop = useIsDesktop();
  useEffect(() => {
    document.title = copy.docTitle;
  }, []);

  if (!desktop) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <h1 className="m-0 text-display">{copy.title}</h1>
        <Outlet />
      </div>
    );
  }

  return (
    <GlassCard
      level={2}
      className="mx-auto grid min-h-0 w-full max-w-window flex-1 grid-cols-[240px_1fr] overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-col border-r border-hairline">
        <ScrollPane
          className="flex-1"
          headerClassName="px-5 pt-5 pb-3"
          scrollClassName="mr-2 mb-5"
          bodyClassName="pl-5 pr-3 pt-2"
          header={
            <div className="flex flex-col gap-4">
              <Link
                to="/"
                className="hl-focus inline-flex items-center gap-1 self-start rounded-xs px-3 text-body-sm text-ink-muted no-underline hover:text-ink"
              >
                <ChevronLeft aria-hidden {...iconDefaults} className="size-4" />
                {copy.backHome}
              </Link>
              <p className="m-0 px-3 text-title-2 font-bold" aria-hidden="true">
                {copy.title}
              </p>
            </div>
          }
        >
          <StoreSidebar />
        </ScrollPane>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <Outlet />
      </div>
    </GlassCard>
  );
}

/** One store view: its heading (and the search field, US-STORE-03) over content that scrolls on its own. */
export function StoreView({
  title,
  children,
  actions,
  phoneTitle = true,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Off where the phone's "App Store" title already names the view (Discover). */
  phoneTitle?: boolean;
}) {
  const desktop = useIsDesktop();
  const heading = <h2 className="m-0 text-display">{title}</h2>;
  if (!desktop) {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {actions}
          {phoneTitle ? <h2 className="m-0 text-title-1">{title}</h2> : <h2 className="sr-only">{title}</h2>}
        </div>
        {children}
      </section>
    );
  }
  return (
    <ScrollPane
      className="flex-1"
      headerClassName="px-8 pt-6 pb-4"
      scrollClassName="mr-2 mb-5"
      bodyClassName="px-8 pb-2"
      header={
        <div className="flex items-center justify-between gap-6">
          {heading}
          {actions}
        </div>
      }
    >
      {children}
    </ScrollPane>
  );
}
