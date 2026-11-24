// Chart tooltips by touch (US-TAB-01): with no mouse there's no hover, so a finger held on a chart for a long press
// shows the tooltip where it rests and follows it while it slides; lifting it hides the tooltip. The mouse events a
// browser makes up after a tap are kept away from the chart, so a tap doesn't leave a tooltip stuck on it.
import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useLongPress, type Point } from '../lib/long-press';
import { useIsTouch } from '../lib/media';

const MOUSE = ['mouseover', 'mouseout', 'mousemove', 'mouseenter', 'mouseleave'] as const;

/** Props for the chart's <figure>. */
export function useHoldTooltip() {
  const touch = useIsTouch();
  const ref = useRef<HTMLElement>(null);
  const under = useRef<Element | null>(null);

  // A tablet has no mouse: what looks like one on the chart came from a finger's tap.
  useEffect(() => {
    const el = ref.current;
    if (!touch || !el) return;
    const block = (e: Event) => {
      if (e.isTrusted) e.stopPropagation();
    };
    for (const type of MOUSE) el.addEventListener(type, block, true);
    return () => {
      for (const type of MOUSE) el.removeEventListener(type, block, true);
    };
  }, [touch]);

  /** Tells the chart a pointer is at `at`, as a mouse moving there would. */
  const point = (at: Point) => {
    const doc = ref.current?.ownerDocument;
    const target = doc?.elementFromPoint(at.x, at.y) ?? null;
    if (!target || !ref.current?.contains(target)) return leave();
    const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, view: doc?.defaultView ?? null };
    if (under.current !== target) {
      under.current?.dispatchEvent(new MouseEvent('mouseout', { ...init, relatedTarget: target }));
      target.dispatchEvent(new MouseEvent('mouseover', { ...init, relatedTarget: under.current }));
      under.current = target;
    }
    target.dispatchEvent(new MouseEvent('mousemove', init));
  };
  const leave = () => {
    under.current?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: null }));
    under.current = null;
  };
  const press = useLongPress({
    enabled: touch,
    onLongPress: point,
    // The finger slides along the chart: the tooltip goes with it.
    onDragStart: point,
    onDragMove: point,
    onDragEnd: leave,
    onRelease: leave,
  });
  return {
    ref,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => press.onPointerDown(e),
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
      press.onContextMenu(e);
    },
  };
}
