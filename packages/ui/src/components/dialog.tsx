import * as RadixDialog from '@radix-ui/react-dialog';
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { cn } from '../lib/cn';
import { useIsPhone } from '../lib/media';
import { BottomSheet } from './sheet';
import { useUiStrings } from '../lib/strings';
import { Children, isValidElement } from 'react';

/** Whether the dialog's own buttons already say "Close" (a sheet then needs no second one in its corner). */
function saysClose(node: ReactNode, close: string): boolean {
  return Children.toArray(node).some((child) => {
    if (typeof child === 'string') return child.trim() === close;
    if (!isValidElement<{ children?: ReactNode }>(child)) return false;
    return saysClose(child.props.children, close);
  });
}

export interface DialogProps {
  /** A question or outcome: "Uninstall Jellyfin?" */
  title: ReactNode;
  /** What happens to the person's data. */
  children?: ReactNode;
  /** Buttons, right-aligned; primary (or destructive) last. */
  actions?: ReactNode;
  /** 'alertdialog' for destructive confirmations. */
  role?: 'dialog' | 'alertdialog';
  width?: CSSProperties['width'];
  className?: string;
}

/** The dialog frame on level-3 glass. Use <ModalDialog> for a real modal with scrim, focus trap and Escape. */
export function Dialog({ title, children, actions, role = 'dialog', width, className }: DialogProps) {
  const titleId = useId();
  return (
    <section
      role={role}
      aria-labelledby={titleId}
      className={cn('hl-dialog hl-glass hl-glass-3', className)}
      style={width ? { width } : undefined}
    >
      <h2 id={titleId} className="hl-dialog-title">
        {title}
      </h2>
      {children ? <div className="hl-dialog-body">{children}</div> : null}
      {actions ? <div className="hl-dialog-actions">{actions}</div> : null}
    </section>
  );
}

export interface ModalDialogProps extends Omit<DialogProps, 'className'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Keep the dialog open on Escape and outside clicks (e.g. while a job runs). */
  dismissible?: boolean;
  /** What will happen; becomes the dialog's accessible description. Shown above `children`. */
  description?: ReactNode;
  /** Where focus goes when it opens; the first focusable element otherwise. */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Below the md breakpoint, a bottom sheet with a grabber, full-width buttons and a close button, that can be
   * dragged down to dismiss (US-PHONE-03). Default true.
   */
  sheetOnPhone?: boolean;
  /**
   * Unsaved input or a running destructive confirmation: as a phone sheet it can't be dragged away or closed from
   * the backdrop; only its buttons (and Escape) close it (US-PHONE-03).
   */
  guarded?: boolean;
  /** Where focus goes when it closes, when not back to what opened it (e.g. the folder New folder just made). */
  finalFocus?: () => HTMLElement | null;
  /** A fixed height whatever its content (a picker): its body grows to fill it; full height as a phone sheet. */
  tall?: boolean;
  /** A symbol above the title, such as the warning of a factory reset (decorative: the title says it). */
  icon?: ReactNode;
}

/**
 * The open modal dialogs, newest last. Escape closes only the newest, once per key press: Radix hands Escape to the
 * layer that last rendered as the top one, and for a moment after a dialog opens over another (a picker over the
 * install sheet) that is still the one below.
 */
const openDialogs: Array<{ escape: () => void }> = [];
const escapes = new WeakSet<Event>();

/** A modal dialog (Radix): scrim-strong behind, focus trapped, Escape closes, focus returns to the trigger. */
export function ModalDialog({
  open,
  onOpenChange,
  dismissible = true,
  title,
  children,
  actions,
  role = 'dialog',
  width,
  description,
  initialFocus,
  sheetOnPhone = true,
  guarded = false,
  finalFocus,
  tall = false,
  icon,
}: ModalDialogProps) {
  const sheet = useIsPhone() && sheetOnPhone;
  const t = useUiStrings();
  // Radix only restores focus to a Dialog.Trigger; remember whatever opened the dialog instead.
  const returnTo = useRef<HTMLElement | null>(null);
  const block = (e: Event) => {
    if (!dismissible) e.preventDefault();
  };
  const latest = useRef({ dismissible, onOpenChange });
  useLayoutEffect(() => {
    latest.current = { dismissible, onOpenChange };
  });
  useLayoutEffect(() => {
    if (!open) return;
    const me = {
      escape: () => {
        if (latest.current.dismissible) latest.current.onOpenChange(false);
      },
    };
    openDialogs.push(me);
    return () => void openDialogs.splice(openDialogs.indexOf(me), 1);
  }, [open]);
  const onEscape = (e: KeyboardEvent) => {
    e.preventDefault();
    if (escapes.has(e)) return;
    escapes.add(e);
    openDialogs.at(-1)?.escape();
  };
  const onOpenAutoFocus = (e: Event) => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!initialFocus?.current) return;
    e.preventDefault();
    initialFocus.current.focus();
  };
  const onCloseAutoFocus = (e: Event) => {
    const to = finalFocus?.();
    if (to?.isConnected) {
      e.preventDefault();
      to.focus();
      return;
    }
    if (!returnTo.current?.isConnected) return;
    e.preventDefault();
    returnTo.current.focus();
  };
  const content = (
    <>
      {icon ? (
        <span aria-hidden className="hl-dialog-icon">
          {icon}
        </span>
      ) : null}
      <RadixDialog.Title className="hl-dialog-title">{title}</RadixDialog.Title>
      {description ? <RadixDialog.Description className="hl-dialog-body">{description}</RadixDialog.Description> : null}
      {children ? <div className="hl-dialog-body">{children}</div> : null}
      {actions ? <div className="hl-dialog-actions">{actions}</div> : null}
    </>
  );
  if (sheet)
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        titled
        described={Boolean(description)}
        role={role}
        dismissible={dismissible}
        guarded={guarded}
        full={tall}
        closeButton={!saysClose(actions, t.close)}
        className="hl-dialog hl-dialog-sheet"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscape}
      >
        {content}
      </BottomSheet>
    );
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="hl-scrim hl-anim-fade" />
        <RadixDialog.Content
          role={role}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn('hl-dialog hl-dialog-modal hl-glass hl-glass-3 hl-anim-dialog', tall && 'hl-dialog-tall')}
          style={width ? { width } : undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={onEscape}
          onPointerDownOutside={block}
          onInteractOutside={block}
        >
          {content}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
