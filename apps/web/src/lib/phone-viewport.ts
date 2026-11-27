// The phone's visual viewport (US-PHONE-02, US-PHONE-03): how tall it is now (the on-screen keyboard takes part of
// it), as --hl-visual-height on <html> for bottom sheets; data-keyboard="open" while the keyboard is up, so the tab
// bar steps aside; and the focused field scrolled into view above the keyboard.

/** The keyboard counts as open when the visual viewport is this much shorter than the layout viewport. */
export const KEYBOARD_MIN_PX = 120;

const EDITABLE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, [contenteditable="true"]';

export function isEditable(el: Element | null): boolean {
  return !!el && el.matches(EDITABLE);
}

/** Whether the keyboard is open: a field has focus and the visual viewport has shrunk. */
export function keyboardOpen(visualHeight: number, layoutHeight: number, focused: Element | null): boolean {
  return isEditable(focused) && layoutHeight - visualHeight >= KEYBOARD_MIN_PX;
}

/** Starts watching; returns a stop function. Does nothing without visualViewport. */
export function watchPhoneViewport(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement;
  let wasOpen = false;
  const update = () => {
    root.style.setProperty('--hl-visual-height', `${Math.round(vv.height)}px`);
    const open = keyboardOpen(vv.height, win.innerHeight, win.document.activeElement);
    if (open) root.setAttribute('data-keyboard', 'open');
    else root.removeAttribute('data-keyboard');
    // The field near the bottom comes up above the keyboard.
    if (open && !wasOpen) {
      const field = win.document.activeElement as HTMLElement | null;
      field?.scrollIntoView?.({ block: 'center' });
    }
    wasOpen = open;
  };
  update();
  vv.addEventListener('resize', update);
  win.document.addEventListener('focusin', update);
  win.document.addEventListener('focusout', update);
  return () => {
    vv.removeEventListener('resize', update);
    win.document.removeEventListener('focusin', update);
    win.document.removeEventListener('focusout', update);
  };
}
