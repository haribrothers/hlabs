import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { cn } from '../lib/cn';

export interface ScrollPaneProps {
  /** Stays at the top while the content scrolls under it and fades out (macOS style). */
  header: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes on the header bar, e.g. the window's padding. The bar spans the whole pane. */
  headerClassName?: string;
  /** Classes on the scrolling area itself, e.g. margins that keep the scrollbar clear of the window's corners. */
  scrollClassName?: string;
  /** Classes on the scrolling content, e.g. gutters. */
  bodyClassName?: string;
  /** Put on the scrolling element (tests, styling hooks). */
  'data-testid'?: string;
  /** The scrolling element, e.g. to remember and restore its position. */
  scrollRef?: Ref<HTMLDivElement>;
}

/**
 * A scrolling area under a fixed header, like macOS Settings: the header has no box, and content scrolling up under
 * it fades out (a gradient mask). The scrollbar starts below the header.
 */
export function ScrollPane({
  header,
  children,
  className,
  headerClassName,
  scrollClassName,
  bodyClassName,
  scrollRef,
  ...rest
}: ScrollPaneProps) {
  const bar = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

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
      className={cn('hl-scroll-pane', className)}
      style={{ '--hl-scroll-header': `${headerHeight}px` } as CSSProperties}
    >
      <div
        ref={scrollRef}
        className={cn('hl-scroll hl-scroll-pane-scroller', scrollClassName)}
        data-testid={rest['data-testid']}
      >
        <div className={cn('hl-scroll-pane-body', bodyClassName)}>{children}</div>
      </div>
      <div ref={bar} className={cn('hl-scroll-pane-header', headerClassName)}>
        {header}
      </div>
    </div>
  );
}
