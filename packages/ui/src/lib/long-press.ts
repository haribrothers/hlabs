// A finger held on something (US-TAB-02, US-TAB-03, D-175): after LONG_PRESS_MS without moving more than
// LONG_PRESS_SLOP_PX it's a long press, which opens what a right-click opens (the device vibrates once where it can);
// moving first is a scroll. Moving after the long press is a drag, while the page holds still. The click a long press
// ends with is swallowed, so what's under the finger doesn't open too. Mice are left alone: they have a right button.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/** How long a finger rests before its menu opens. */
export const LONG_PRESS_MS = 500;
/** A finger that moves this far before then is scrolling; after, it's dragging. */
export const LONG_PRESS_SLOP_PX = 10;
/** How soon after the finger lifts its click arrives (a tap's click comes right after touchend). */
const CLICK_WINDOW_MS = 400;

/** One short buzz where the device can (Android; iPadOS has no Vibration API). */
export function vibrateOnce(): void {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Some browsers throw when vibration isn't allowed yet.
  }
}

/** Stops the page scrolling under a finger that's dragging; returns the way to let it scroll again. */
export function holdScroll(doc: Document = document): () => void {
  const stop = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  doc.addEventListener('touchmove', stop, { passive: false });
  return () => doc.removeEventListener('touchmove', stop);
}

/**
 * Swallows the click a gesture ends with (in the capture phase): one that comes within a moment, where the finger
 * lifted. Any other click (a tap on a menu item, Undo) goes through.
 */
export function swallowNextClick(win: Window = window, at?: { x: number; y: number }): void {
  const until = Date.now() + CLICK_WINDOW_MS;
  const eat = (e: MouseEvent) => {
    if (Date.now() > until) return win.removeEventListener('click', eat, true);
    if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > LONG_PRESS_SLOP_PX) return;
    win.removeEventListener('click', eat, true);
    e.preventDefault();
    e.stopPropagation();
  };
  win.addEventListener('click', eat, true);
  win.setTimeout(() => win.removeEventListener('click', eat, true), CLICK_WINDOW_MS);
}

export interface Point {
  x: number;
  y: number;
}

export interface LongPressOptions {
  /** The press was held: open the menu (at the finger) or show the name. */
  onLongPress?: (at: Point, target: HTMLElement) => void;
  /** The finger moved after the long press: a drag starts (close the menu). */
  onDragStart?: (at: Point, target: HTMLElement) => void;
  onDragMove?: (at: Point) => void;
  /** The finger lifted (`dropped`) or the browser took the gesture away. */
  onDragEnd?: (at: Point, dropped: boolean) => void;
  /** The finger lifted after a long press that didn't become a drag (hide the name again). */
  onRelease?: () => void;
  /** Off: no handlers (a phone, or nothing to open). */
  enabled?: boolean;
}

export interface LongPressHandlers {
  /** The press starts on the element; the rest of it is followed on the window, wherever the finger goes. */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /**
   * The OS's own long-press menu (Chrome sends contextmenu for a held finger) never shows: it opens ours at once
   * instead. Returns true when it was a finger's, so a right-click handler can tell its own from it.
   */
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => boolean;
}

interface Press {
  id: number;
  start: Point;
  at: Point;
  target: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
  fired: boolean;
  dragging: boolean;
  cleanup: Array<() => void>;
}

const point = (e: { clientX: number; clientY: number }): Point => ({ x: e.clientX, y: e.clientY });

/** Long press, then maybe drag, by touch or pen (the options are read when each event comes, so they can change). */
export function useLongPress(options: LongPressOptions): LongPressHandlers {
  const opts = useRef(options);
  useLayoutEffect(() => {
    opts.current = options;
  });
  const press = useRef<Press | null>(null);
  useEffect(() => () => end(press), []);

  const fire = (p: Press) => {
    p.timer = null;
    p.fired = true;
    // From here the finger drags instead of scrolling the page.
    p.cleanup.push(holdScroll(p.target.ownerDocument));
    vibrateOnce();
    opts.current.onLongPress?.(p.start, p.target);
  };

  return {
    onPointerDown: (e) => {
      if (opts.current.enabled === false || e.pointerType === 'mouse') return;
      end(press);
      const win = e.currentTarget.ownerDocument.defaultView ?? window;
      const p: Press = {
        id: e.pointerId,
        start: point(e),
        at: point(e),
        target: e.currentTarget,
        timer: null,
        fired: false,
        dragging: false,
        cleanup: [],
      };
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== p.id) return;
        p.at = point(ev);
        const moved = Math.hypot(p.at.x - p.start.x, p.at.y - p.start.y) > LONG_PRESS_SLOP_PX;
        if (!p.fired) {
          // Moving first: a scroll, not a press.
          if (moved) end(press);
          return;
        }
        if (!p.dragging && moved && opts.current.onDragStart) {
          p.dragging = true;
          opts.current.onDragStart(p.at, p.target);
        }
        if (p.dragging) opts.current.onDragMove?.(p.at);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== p.id) return;
        if (p.dragging) opts.current.onDragEnd?.(point(ev), true);
        else if (p.fired) opts.current.onRelease?.();
        // A held finger that lifts in place may still make a click there: it isn't a tap.
        if (p.fired && !p.dragging) swallowNextClick(win, point(ev));
        end(press);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== p.id) return;
        if (p.dragging) opts.current.onDragEnd?.(p.at, false);
        else if (p.fired) opts.current.onRelease?.();
        end(press);
      };
      win.addEventListener('pointermove', onMove, true);
      win.addEventListener('pointerup', onUp, true);
      win.addEventListener('pointercancel', onCancel, true);
      p.cleanup.push(() => {
        win.removeEventListener('pointermove', onMove, true);
        win.removeEventListener('pointerup', onUp, true);
        win.removeEventListener('pointercancel', onCancel, true);
      });
      p.timer = setTimeout(() => fire(p), LONG_PRESS_MS);
      press.current = p;
    },
    onContextMenu: (e) => {
      const p = press.current;
      if (!p) return false;
      e.preventDefault();
      if (!p.fired) {
        if (p.timer) clearTimeout(p.timer);
        fire(p);
      }
      return true;
    },
  };
}

function end(press: { current: Press | null }) {
  const p = press.current;
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  for (const undo of p.cleanup) undo();
  press.current = null;
}

/**
 * A tap outside an open menu on a tablet (US-TAB-02): it closes the menu on the tap's click, its last event, and
 * nothing under the finger gets any of it, so the tap never opens what's beneath (the phone tile menu's old bug, fixed
 * the same way in PhoneMenuLayer, which handles its own layer). Only with `data-input="touch"`; returns a stop function.
 */
export function guardTapsOutsideMenus(win: Window = window): () => void {
  const doc = win.document;
  let pending: Element | null = null;
  const outside = (e: Event) => {
    if (doc.documentElement.getAttribute('data-input') !== 'touch') return null;
    const menu = doc.querySelector('[role="menu"]');
    const target = e.target instanceof Element ? e.target : null;
    if (!menu || !target || target.closest('[role="menu"], .hl-p-menu-layer')) return null;
    return menu;
  };
  const onDown = (e: PointerEvent) => {
    pending = null;
    if (e.pointerType === 'mouse') return;
    const menu = outside(e);
    if (!menu) return;
    pending = menu;
    e.stopPropagation();
  };
  const onClick = (e: MouseEvent) => {
    const menu = pending;
    pending = null;
    if (!menu || !menu.isConnected) return;
    e.preventDefault();
    e.stopPropagation();
    // The menu's own way to close (Escape), as a click outside would on a computer.
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  };
  win.addEventListener('pointerdown', onDown, true);
  win.addEventListener('click', onClick, true);
  return () => {
    win.removeEventListener('pointerdown', onDown, true);
    win.removeEventListener('click', onClick, true);
  };
}
