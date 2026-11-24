// An iPad by touch for component tests (14-tablet.md): matchMedia answers as a touch screen with no mouse at `width`
// (1180 landscape, 820 portrait), so the desktop layout's touch mode applies (D-175).
import { TOUCH_PORTRAIT_QUERY, TOUCH_QUERY } from '@hlabs/ui';
import { phoneViewport } from './phone';

/** Puts the page on an iPad until the returned function is called. */
export function tabletViewport(width = 1180): () => void {
  const restore = phoneViewport(width, {
    [TOUCH_QUERY]: width >= 768,
    [TOUCH_PORTRAIT_QUERY]: width >= 768 && width <= 1023,
  });
  document.documentElement.setAttribute('data-input', 'touch');
  return () => {
    document.documentElement.removeAttribute('data-input');
    restore();
  };
}

/** A finger's pointer event fields. */
export const finger = (x = 5, y = 5) => ({ pointerType: 'touch', pointerId: 1, clientX: x, clientY: y });

/** Gives an element a box (jsdom has no layout). */
export function place(el: Element, r: { x: number; y: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({ ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height, toJSON: () => r }) as DOMRect;
}
