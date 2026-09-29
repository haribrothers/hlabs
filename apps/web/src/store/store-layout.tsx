// The App Store window (US-STORE-01…03): on desktop a sidebar ("Back to Home", the title, Discover and the
// categories) and the open view under a header with its title and the search field; on a phone the title, the search
// field and a chip row of categories over the view. The search field belongs to the window, not the view, so it keeps
// focus while typing moves between Discover and the results.
import { ChevronLeft, iconDefaults } from '@hlabs/icons';
import { GlassCard, ScrollPane } from '@hlabs/ui';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { storeCopy } from '../copy/store';
import { useIsDesktop } from '../lib/use-media';
import { StoreChips, StoreSidebar } from './categories';
import { StoreSearchField } from './search';
import { useStoreScrollMemory } from './store-return';

const copy = storeCopy;

/** Lets a view put its title in the window's header. */
const TitleContext = createContext<(title: string) => void>(() => {});

export function StoreLayout() {
  const desktop = useIsDesktop();
  const [title, setTitle] = useState('');
  const href = useRouterState({ select: (s) => s.location.href });
  const scroller = useRef<HTMLDivElement>(null);
  useStoreScrollMemory(href, desktop ? scroller : null);
  useEffect(() => {
    document.title = copy.docTitle;
  }, []);

  if (!desktop) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <h1 className="m-0 text-display">{copy.title}</h1>
        <StoreSearchField desktop={false} />
        <StoreChips />
        <TitleContext.Provider value={setTitle}>
          <Outlet />
        </TitleContext.Provider>
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
        <ScrollPane
          scrollRef={scroller}
          className="flex-1"
          headerClassName="px-8 pt-6 pb-4"
          scrollClassName="mr-2 mb-5"
          bodyClassName="px-8 pb-2"
          header={
            <div className="flex items-center justify-between gap-6">
              <h2 className="m-0 min-w-0 truncate text-title-1 font-bold">{title}</h2>
              <StoreSearchField desktop />
            </div>
          }
        >
          <TitleContext.Provider value={setTitle}>
            <Outlet />
          </TitleContext.Provider>
        </ScrollPane>
      </div>
    </GlassCard>
  );
}

/** One store view: it names itself in the window's header (desktop) or above its content (phone). */
export function StoreView({
  title,
  children,
  phoneTitle = true,
}: {
  title: string;
  children: ReactNode;
  /** Off where the phone's "App Store" title already names the view (Discover). */
  phoneTitle?: boolean;
}) {
  const desktop = useIsDesktop();
  const setTitle = useContext(TitleContext);
  useLayoutEffect(() => setTitle(title), [setTitle, title]);
  if (desktop) return <>{children}</>;
  return (
    <section className="flex flex-col gap-4">
      <h2 className={phoneTitle ? 'm-0 text-title-1' : 'sr-only'}>{title}</h2>
      {children}
    </section>
  );
}
