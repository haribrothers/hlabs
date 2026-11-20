// A long press on a file or folder starts selecting it (D-137): half a second held without moving, with a finger or
// the mouse. The click that ends it is swallowed, so the item doesn't open as well.
import type { PointerEvent } from 'react';

export const LONG_PRESS_MS = 500;
const SLOP_PX = 8;

let timer: ReturnType<typeof setTimeout> | null = null;
let start = { x: 0, y: 0 };
let fired = false;

const cancel = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

/** Handlers for an item; `onLong` runs after the press is held. */
export function longPressProps(onLong: (() => void) | undefined) {
  if (!onLong) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      cancel();
      fired = false;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}

/** True once after a long press: the click that follows it is not an open. */
export function consumeLongPress(): boolean {
  const was = fired;
  fired = false;
  return was;
}
