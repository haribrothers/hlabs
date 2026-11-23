// Files' header on a phone (PhoneRedesignA_Files, D-172): its bar ("+" and "Select", or "Select all · 2 selected ·
// Done" while selecting) over the large "Files" title, and a compact bar once the title has scrolled away. The large
// title is only drawn: the open folder's name in the breadcrumb is the page's heading (US-FILE-02).
import { cn } from '@hlabs/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';

/** Whether the title has scrolled under the compact bar (as PhoneHeader works it out). */
function useScrolledPast(el: React.RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setPast(entry ? !entry.isIntersecting : false), {
      rootMargin: '-44px 0px 0px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [el]);
  return past;
}

export function FilesPhoneHeader({
  leading,
  middle,
  trailing,
}: {
  /** "Select all" while selecting. */
  leading?: ReactNode;
  /** "2 selected" while selecting: drawn in the compact bar too, from `data-label`, so it's read once. */
  middle?: string;
  /** "+" and "Select", or "Done". */
  trailing?: ReactNode;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const collapsed = useScrolledPast(sentinel);
  return (
    <header className="hl-p-header">
      <div className="hl-p-bar" data-collapsed={collapsed || undefined} aria-hidden={!collapsed}>
        <span className="hl-p-bar-side">{leading}</span>
        <span className="hl-p-bar-title hl-p-files-compact" data-label={middle ?? copy.title} />
        <span className="hl-p-bar-side hl-p-bar-end">{trailing}</span>
      </div>
      <div className={cn('hl-p-nav', 'hl-p-files-nav')}>
        <span className="justify-self-start">{leading}</span>
        {middle ? <span className="hl-p-bar-title">{middle}</span> : <span />}
        <span className="hl-p-bar-end justify-self-end">{trailing}</span>
      </div>
      <div className="hl-p-title-row">
        <p className="hl-p-large" aria-hidden="true">
          {copy.title}
        </p>
      </div>
      <div ref={sentinel} aria-hidden className="hl-p-sentinel" />
    </header>
  );
}
