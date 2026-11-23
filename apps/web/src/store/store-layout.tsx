// The App Store window (US-STORE-01…03): on desktop a sidebar ("Back to Home", the title, Discover and the
// categories) and the open view under a header with its title and the search field; on a phone the title, the search
// field and a chip row of categories over the view. The search field belongs to the window, not the view, so it keeps
// focus while typing moves between Discover and the results.
import { ChevronLeft, iconDefaults } from '@hlabs/icons';
import { GlassCard, PhoneHeader, ScrollPane } from '@hlabs/ui';
import { Link, Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { storeCopy } from '../copy/store';
import { useIsDesktop } from '../lib/use-media';
import { StoreSidebar } from './categories';
import { StoreSearchField } from './search';
import { useStoreScrollMemory } from './store-return';

const copy = storeCopy;

/** Lets a view put its title in the window's header. */
const TitleContext = createContext<(title: string) => void>(() => {});

/**
 * Where a view's own button goes in the header, in place of the search field (Updates' "Update all"), and saying the
 * view has one.
 */
const ActionContext = createContext<{
  /** Inside the store window (which has the header). */
  inWindow: boolean;
  slot: HTMLElement | null;
  setHasAction: (has: boolean) => void;
}>({ inWindow: false, slot: null, setHasAction: () => {} });

export function StoreLayout() {
  const desktop = useIsDesktop();
  const [title, setTitle] = useState('');
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [hasAction, setHasAction] = useState(false);
  const href = useRouterState({ select: (s) => s.location.href });
  const scroller = useRef<HTMLDivElement>(null);
  useStoreScrollMemory(href, desktop ? scroller : null);
  useEffect(() => {
    document.title = copy.docTitle;
  }, []);

  if (!desktop) {
    // PhoneStore (US-PHONE-10, D-172): "App Store" as a large title and the search field over Discover and the
    // results (the field stays put while typing moves between them); a category, a "See all" list and Updates are
    // screens you go into, with "‹ App Store" (StoreView).
    const pushed = !/^\/store(\/search)?\/?$/.test(new URL(href, 'http://hlabs.invalid').pathname);
    return (
      // As tall as its content: the page scrolls as a whole and its last row clears the tab bar.
      <div className="flex w-full flex-col gap-4">
        {pushed ? null : (
          <div className="flex flex-col gap-2.5">
            <PhoneHeader title={copy.title} />
            <StoreSearchField desktop={false} />
          </div>
        )}
        <TitleContext.Provider value={setTitle}>
          <Outlet />
        </TitleContext.Provider>
      </div>
    );
  }

  return (
    <GlassCard
      level={2}
      className="hl-window-fill mx-auto grid min-h-0 w-full max-w-window flex-1 grid-cols-[240px_1fr] overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-col border-r border-hairline">
        <ScrollPane
          className="flex-1"
          headerClassName="px-5 pt-5 pb-3"
          scrollClassName="mr-2 mb-5"
          bodyClassName="pl-5 pr-3 pt-2"
          header={
            <div className="flex flex-col gap-7">
              <Link
                to="/"
                className="hl-focus inline-flex items-center gap-2.5 self-start rounded-xs pl-3 text-body-sm text-ink-muted no-underline hover:text-ink"
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
          // The body sits inside the scroller's right margin (mr-2) and its scrollbar gutter (8px), so the header's right
          // padding adds both: the search field lines up with the cards below.
          headerClassName="pl-8 pr-12 pt-6 pb-4"
          scrollClassName="mr-2 mb-5"
          bodyClassName="px-8 pb-2"
          header={
            <div className="flex items-center justify-between gap-6">
              <h2 className="m-0 min-w-0 truncate text-title-1 font-bold">{title}</h2>
              <div ref={setSlot} className={hasAction ? 'contents' : 'hidden'} />
              {hasAction ? null : <StoreSearchField desktop />}
            </div>
          }
        >
          <TitleContext.Provider value={setTitle}>
            <ActionContext.Provider value={{ inWindow: true, slot, setHasAction }}>
              <Outlet />
            </ActionContext.Provider>
          </TitleContext.Provider>
        </ScrollPane>
      </div>
    </GlassCard>
  );
}

/** "‹ App Store" on a phone: Back when there's somewhere to go back to, else the store (US-PHONE-04). */
export function useStoreBack(parent: () => string = () => '/store') {
  const router = useRouter();
  const navigate = useNavigate();
  return {
    label: copy.title,
    onBack: () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: parent() })),
  };
}

/** One store view: it names itself in the window's header (desktop) or above its content (phone). */
export function StoreView({
  title,
  children,
  phoneTitle = true,
  phoneBack = true,
  ownPhoneHeader = false,
  action = null,
}: {
  title: string;
  children: ReactNode;
  /** Off where the phone's "App Store" title already names the view (Discover). */
  phoneTitle?: boolean;
  /** On a phone, a screen you went into: "‹ App Store" over a large title. Off for the search results. */
  phoneBack?: boolean;
  /** A button for the header, in place of the search field on desktop; under the title on a phone. */
  action?: ReactNode;
  /** On a phone the view draws its own PhoneHeader (a category, a "See all" list): no second heading here. */
  ownPhoneHeader?: boolean;
}) {
  const back = useStoreBack();
  const desktop = useIsDesktop();
  const setTitle = useContext(TitleContext);
  const { inWindow, slot, setHasAction } = useContext(ActionContext);
  useLayoutEffect(() => setTitle(title), [setTitle, title]);
  const hasAction = action !== null;
  useLayoutEffect(() => {
    setHasAction(hasAction);
    return () => setHasAction(false);
  }, [setHasAction, hasAction]);
  // In the window's header (once it's there); outside the store window, beside the title as on a phone.
  if (desktop && (inWindow || !action))
    return (
      <>
        {action && slot ? createPortal(action, slot) : null}
        {children}
      </>
    );
  if (!desktop && phoneTitle && phoneBack)
    return (
      <section className="flex flex-col gap-4">
        <PhoneHeader title={title} back={back} />
        {action}
        {children}
      </section>
    );
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {ownPhoneHeader ? null : <h2 className={phoneTitle ? 'm-0 text-title-1' : 'sr-only'}>{title}</h2>}
        {action}
      </div>
      {children}
    </section>
  );
}
