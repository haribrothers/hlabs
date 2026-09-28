import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ScrollPaneProps {
  /** Stays at the top on a blurred bar while the content scrolls under it (iOS style). */
  header: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra classes on the header bar, e.g. the window's padding (the bar reaches the pane's edges). */
  headerClassName?: string;
  /** Extra classes on the scrolling content, e.g. gutters. */
  bodyClassName?: string;
  /** For tests and styling hooks. */
  'data-testid'?: string;
}

/**
 * A scrolling area with a sticky header on bar-blur glass. Content scrolls up underneath the header; the scrollbar
 * starts below it (the track is inset by the header's height) and a hairline appears under the header once scrolled.
 */
export function ScrollPane({ header, children, className, headerClassName, bodyClassName, ...rest }: ScrollPaneProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    observer.observe(el);
    setHeaderHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={scroller}
      className={cn('hl-scroll hl-scroll-pane', className)}
      style={{ '--hl-scroll-header': `${headerHeight}px` } as CSSProperties}
      data-scrolled={scrolled ? '' : undefined}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
      data-testid={rest['data-testid']}
    >
      <div ref={bar} className={cn('hl-scroll-pane-header', headerClassName)}>
        {header}
      </div>
      <div className={cn('hl-scroll-pane-body', bodyClassName)}>{children}</div>
    </div>
  );
}
