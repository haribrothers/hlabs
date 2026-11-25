// HomePublicAddress's popover (US-SYS-47): under a tile on the public dashboard's Home, for an app that isn't public:
// "<App> opens at home or on your tailnet.", why, and for admins "Make <App> public…" (itself at home only). Escape or
// a click outside closes it and focus goes back to the tile. It opens above the tile when there's no room below it
// (the Dock, or the bottom of the window).
import { House, iconDefaults } from '@hlabs/icons';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { publicDashboardCopy as copy } from '../copy/public-dashboard';
import { MakePublicAway } from '../public/home-only';

export function AwayPopover({
  name,
  isAdmin,
  onClose,
}: {
  name: string;
  isAdmin: boolean;
  onClose: (returnFocus: boolean) => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const dock = document.querySelector('nav[aria-label="Dock"]')?.getBoundingClientRect();
    const floor = Math.min(window.innerHeight, dock?.top ?? window.innerHeight);
    if (box.bottom > floor) setAbove(true);
  }, []);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const li = ref.current?.closest('li');
      if (li && !li.contains(e.target as Node)) close.current(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`hl-glass hl-glass-3 hl-focus absolute left-1/2 z-30 flex w-[min(450px,90vw)] -translate-x-1/2 flex-col gap-3 rounded-lg p-4 text-left ${above ? 'bottom-full mb-3' : 'top-full mt-3'}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface-control text-ink">
          <House aria-hidden {...iconDefaults} size={18} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id={titleId} className="m-0 text-body font-semibold">
            {copy.opensAtHome(name)}
          </p>
          <p className="m-0 text-caption text-ink-muted">{copy.notPublicNote}</p>
        </div>
      </div>
      {isAdmin ? <MakePublicAway name={name} onChoose={() => onClose(false)} /> : null}
    </div>
  );
}
