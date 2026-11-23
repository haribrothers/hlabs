// The phone's bottom sheet (US-PHONE-03): what is a Dialog on desktop slides up from the bottom with a grab handle,
// over a dimmed backdrop, on the soft spring. Dragged down more than 30% of its height, or let go moving down faster
// than 500 px/s, it closes; otherwise it springs back. Reduce motion: it fades in and out in 150 ms instead. It is
// at most 92% of the visual viewport tall and its body scrolls inside.
import { iconDefaults, X } from '@hlabs/icons';
import * as RadixDialog from '@radix-ui/react-dialog';
import { animate, AnimatePresence, motion as m, useMotionValue, type MotionStyle } from 'framer-motion';
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { motion, useReduceMotion } from '../lib/motion';
import { useUiStrings } from '../lib/strings';

/** Past this share of the sheet's height, a drag closes it. */
export const SHEET_DISMISS_SHARE = 0.3;
/** A release moving down faster than this (px/s) closes it. */
export const SHEET_DISMISS_VELOCITY = 500;
/** The reduced-motion fade (ms). */
export const SHEET_FADE_MS = 150;
/** A pointer must move this far down before the sheet follows it (a tap stays a tap). */
const DRAG_START_PX = 6;

/** Whether a drag that ended `offset` px down at `velocity` px/s, on a sheet `height` tall, dismisses it. */
export function sheetDismisses(offset: number, velocity: number, height: number): boolean {
  return offset > height * SHEET_DISMISS_SHARE || velocity > SHEET_DISMISS_VELOCITY;
}

/** Where a drag never starts: fields, and anything that scrolls sideways (screenshots). */
const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-no-sheet-drag]';

function scrollsSideways(el: Element | null, stop: Element): boolean {
  for (let at = el; at && at !== stop; at = at.parentElement) {
    if (at.scrollWidth > at.clientWidth + 1) {
      const x = getComputedStyle(at).overflowX;
      if (x === 'auto' || x === 'scroll') return true;
    }
  }
  return false;
}

/** Scrolled down inside the sheet: a downward swipe scrolls back up instead of moving the sheet. */
function scrolledDown(el: Element | null, stop: Element): boolean {
  for (let at = el; at && at !== stop; at = at.parentElement) if (at.scrollTop > 0) return true;
  return false;
}

/** The sheet's motion: in and out, and drag to dismiss (when `draggable`). */
export function useSheetMotion({ draggable, onDismiss }: { draggable: boolean; onDismiss: () => void }) {
  const reduce = useReduceMotion();
  const y = useMotionValue(0);
  const drag = useRef<{ id: number; startY: number; last: Array<{ y: number; t: number }>; on: boolean } | null>(null);
  const sheet = useRef<HTMLElement | null>(null);

  const variants = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: SHEET_FADE_MS / 1000 },
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: motion.springSoft,
      };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!draggable || e.button !== 0) return;
    const target = e.target as Element;
    const root = e.currentTarget;
    if (target.closest(NO_DRAG) || scrollsSideways(target, root) || scrolledDown(target, root)) return;
    sheet.current = root;
    drag.current = { id: e.pointerId, startY: e.clientY, last: [{ y: e.clientY, t: e.timeStamp }], on: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.on) {
      // Upward first: it's a scroll, not a drag.
      if (dy < -DRAG_START_PX) {
        drag.current = null;
        return;
      }
      if (dy < DRAG_START_PX) return;
      d.on = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    y.set(Math.max(0, dy));
    d.last = [...d.last.slice(-4), { y: e.clientY, t: e.timeStamp }];
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.on) return;
    const first = d.last[0]!;
    const last = d.last.at(-1)!;
    const seconds = Math.max((last.t - first.t) / 1000, 0.001);
    const velocity = (last.y - first.y) / seconds;
    const height = sheet.current?.getBoundingClientRect().height ?? window.innerHeight;
    if (sheetDismisses(y.get(), velocity, height)) onDismiss();
    else void animate(y, 0, motion.springSoft);
  };

  return {
    reduce,
    variants,
    style: { y } as MotionStyle,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}

/** The grab handle at the top of a sheet (decorative: the sheet closes with its close button or Escape too). */
export function SheetHandle() {
  return <span aria-hidden className="hl-sheet-handle" />;
}

/** "✕", labelled "Close", in a sheet's top right corner. */
export function SheetClose({ onClose }: { onClose: () => void }) {
  const t = useUiStrings();
  return (
    <button type="button" className="hl-sheet-close hl-focus" aria-label={t.close} onClick={onClose}>
      <X aria-hidden {...iconDefaults} />
    </button>
  );
}

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the sheet for screen readers when it has no visible title of its own (`title` below). */
  label?: string;
  /** The sheet's title, shown by the content; `label` names it otherwise. */
  titled?: boolean;
  /** Whether the content has a Radix Description. */
  described?: boolean;
  role?: 'dialog' | 'alertdialog';
  /** False: only the sheet's own buttons close it (a job is running). Escape and the close button too. */
  dismissible?: boolean;
  /**
   * Unsaved input or a running destructive confirmation: no drag and no backdrop dismiss; only the explicit buttons
   * (and Escape on a hardware keyboard) close it (US-PHONE-03, US-PHONE-12).
   */
  guarded?: boolean;
  /** As tall as a sheet gets (92% of the visual viewport) whatever its content: App settings, Install. */
  full?: boolean;
  /** "✕" in the top right corner. Default true; a sheet with a Cancel button of its own passes false. */
  closeButton?: boolean;
  className?: string;
  onOpenAutoFocus?: (e: Event) => void;
  onCloseAutoFocus?: (e: Event) => void;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
}

/**
 * The phone's bottom sheet (US-PHONE-03): a grabber, a dimmed backdrop, the soft spring (a 150 ms fade with Reduce
 * motion), drag down to dismiss, focus trapped and the page behind kept still; focus goes back to what opened it.
 */
export function BottomSheet({
  open,
  onOpenChange,
  label,
  titled = false,
  described = false,
  role = 'dialog',
  dismissible = true,
  guarded = false,
  full = false,
  closeButton = true,
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  children,
}: BottomSheetProps) {
  const { reduce, variants, style, handlers } = useSheetMotion({
    draggable: dismissible && !guarded,
    onDismiss: () => onOpenChange(false),
  });
  const fade = reduce ? { duration: SHEET_FADE_MS / 1000 } : { duration: 0.2 };
  const block = (e: Event) => {
    if (!dismissible || guarded) e.preventDefault();
  };
  // Focus goes back to what opened the sheet (Radix only does that for its own Trigger), unless the caller says.
  const returnTo = useRef<HTMLElement | null>(null);
  const opened = (e: Event) => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onOpenAutoFocus?.(e);
  };
  const closed = (e: Event) => {
    if (onCloseAutoFocus) return onCloseAutoFocus(e);
    if (!returnTo.current?.isConnected) return;
    e.preventDefault();
    returnTo.current.focus();
  };
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay forceMount asChild>
              <m.div
                className="hl-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content
              forceMount
              asChild
              role={role}
              {...(described ? {} : { 'aria-describedby': undefined })}
              onOpenAutoFocus={opened}
              onCloseAutoFocus={closed}
              onEscapeKeyDown={(e) => {
                if (onEscapeKeyDown) onEscapeKeyDown(e);
                else if (!dismissible) e.preventDefault();
              }}
              onPointerDownOutside={(e) => {
                // A toast over the sheet can be pressed without closing it.
                if ((e.target as Element | null)?.closest?.('[data-hl-toasts]')) e.preventDefault();
                else block(e);
              }}
              onInteractOutside={block}
            >
              <m.div
                className={cn('hl-sheet', full && 'hl-sheet-full', className)}
                data-sheet=""
                style={style}
                initial={variants.initial}
                animate={variants.animate}
                exit={variants.exit}
                transition={variants.transition}
                {...handlers}
              >
                {titled ? null : (
                  <RadixDialog.Title asChild>
                    <span className="sr-only">{label}</span>
                  </RadixDialog.Title>
                )}
                <SheetHandle />
                {closeButton && dismissible ? <SheetClose onClose={() => onOpenChange(false)} /> : null}
                {children}
              </m.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

/** A sheet's title (names the sheet for screen readers): pass `titled` to BottomSheet when you use it. */
export const SheetTitle = RadixDialog.Title;
export const SheetDescription = RadixDialog.Description;
